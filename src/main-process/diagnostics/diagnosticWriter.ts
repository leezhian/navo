import { appendFile, mkdir, stat, writeFile } from "node:fs/promises";
import { appendFileSync, closeSync, mkdirSync, openSync, readSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DiagnosticEntry } from "../../shared/diagnosticTypes";
import { MAX_DIAGNOSTIC_ENTRY_BYTES, MAX_DIAGNOSTIC_LOG_BYTES } from "../../shared/diagnosticTypes";
import { validateDiagnosticLogPath } from "../services/diagnosticLogPath";
import { isDiagnosticLogEntry } from "./diagnosticLogFormat";
import { makeDiagnosticEntry } from "./diagnosticSanitizer";

const MAX_PENDING_ENTRIES = 1000;
const ERROR_RESERVED_ENTRIES = 100;
const REPEAT_WINDOW_MS = 30000;
const MAX_REPEAT_KEYS = 128;

interface WriteJob { entry: DiagnosticEntry; filePath: string | null; done: () => void; }
interface ControlJob { run: () => Promise<void>; done: () => void; fail: (error: unknown) => void; resetsFailure: boolean; }
type LogJob = WriteJob | ControlJob;

export class DiagnosticWriter {
  private pathResolver: (() => string) | null = null;
  private jobs: LogJob[] = [];
  private running = false;
  private failed = false;
  private repeats = new Map<string, { entry: DiagnosticEntry; filePath: string | null; count: number; time: number }>();
  private dropped = new Map<string | null, number>();
  private summaryTimer: ReturnType<typeof setTimeout> | null = null;

  configure(pathResolver: () => string) {
    this.pathResolver = pathResolver;
    this.start();
  }

  private currentPath() { return this.pathResolver ? this.pathResolver() : null; }

  write(entry: DiagnosticEntry): Promise<void> {
    try {
      const filePath = this.currentPath();
      if (entry.level !== "INFO" && entry.event !== "log.repeated" && entry.event !== "log.dropped") {
        const key = JSON.stringify([filePath, entry.event, entry.error?.code, entry.error?.name, entry.error?.stack?.[0], entry.data.taskId, entry.data.reason]);
        const previous = this.repeats.get(key);
        if (previous && Date.now() - previous.time < REPEAT_WINDOW_MS) { previous.count += 1; this.scheduleSummary(); return Promise.resolve(); }
        if (previous) this.repeatSummary(previous);
        if (this.repeats.size >= MAX_REPEAT_KEYS) this.flushSummaries();
        this.repeats.set(key, { entry, filePath, count: 0, time: Date.now() });
      }
      return this.enqueue(entry, filePath);
    } catch { this.failed = true; return Promise.resolve(); }
  }

  private enqueue(entry: DiagnosticEntry, filePath: string | null): Promise<void> {
    const limit = entry.level === "INFO" ? MAX_PENDING_ENTRIES - ERROR_RESERVED_ENTRIES : MAX_PENDING_ENTRIES;
    if (this.jobs.length >= limit) {
      const replace = entry.level !== "INFO" ? this.jobs.findIndex((job) => "entry" in job && job.entry.level === "INFO") : -1;
      if (replace < 0) { this.noteDrop(filePath); return Promise.resolve(); }
      const removed = this.jobs.splice(replace, 1)[0] as WriteJob;
      removed.done(); this.noteDrop(removed.filePath);
    }
    return new Promise((done) => { this.jobs.push({ entry, filePath, done }); this.start(); });
  }

  private noteDrop(filePath: string | null) {
    // 极端情况下路径反复变化，也不允许统计表无限增长。
    const key = this.dropped.size < MAX_REPEAT_KEYS || this.dropped.has(filePath) ? filePath : null;
    this.dropped.set(key, (this.dropped.get(key) ?? 0) + 1);
  }

  private scheduleSummary() {
    if (this.summaryTimer) return;
    this.summaryTimer = setTimeout(() => { this.summaryTimer = null; this.flushSummaries(); }, REPEAT_WINDOW_MS);
    this.summaryTimer.unref();
  }

  private repeatSummary(value: { entry: DiagnosticEntry; filePath: string | null; count: number }) {
    if (!value.count) return;
    const summary = makeDiagnosticEntry("log.repeated", { count: value.count });
    if (summary) {
      // 原事件名来自固定事件集合，可用于关联，不保留异常正文。
      summary.error = { name: "RepeatedEvent", code: value.entry.event, message: "Repeated diagnostics suppressed." };
      void this.enqueue(summary, value.filePath);
    }
  }

  private flushSummaries() {
    if (this.summaryTimer) clearTimeout(this.summaryTimer);
    this.summaryTimer = null;
    const values = [...this.repeats.values()];
    this.repeats.clear();
    for (const value of values) this.repeatSummary(value);
  }

  private start() {
    if (!this.pathResolver || this.running) return;
    this.running = true;
    void this.drain();
  }

  private async drain() {
    try {
      while (this.jobs.length || this.dropped.size) {
        if (!this.jobs.length) {
          const counts = [...this.dropped]; this.dropped.clear();
          for (const [filePath, count] of counts) {
            const entry = makeDiagnosticEntry("log.dropped", { count });
            if (entry) this.jobs.push({ entry, filePath, done: () => undefined });
          }
        }
        const job = this.jobs.shift();
        if (!job) continue;
        try {
          if ("entry" in job) {
            const filePath = job.filePath ?? this.currentPath();
            if (filePath) await this.append(filePath, job.entry);
          } else await job.run();
          if ("entry" in job || job.resetsFailure) this.failed = false;
          job.done();
        } catch (error) {
          this.failed = true;
          if ("entry" in job) job.done();
          else job.fail(error);
        }
      }
    } finally { this.running = false; }
  }

  private serialize(entry: DiagnosticEntry) {
    let output = JSON.stringify(entry) + "\n";
    if (Buffer.byteLength(output) > MAX_DIAGNOSTIC_ENTRY_BYTES) {
      output = JSON.stringify({ ...entry, data: {}, error: entry.error ? { ...entry.error, stack: undefined } : undefined }) + "\n";
    }
    return Buffer.byteLength(output) <= MAX_DIAGNOSTIC_ENTRY_BYTES ? output : "";
  }

  private async append(filePath: string, entry: DiagnosticEntry) {
    const output = this.serialize(entry);
    if (!output) return;
    await validateDiagnosticLogPath(filePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    let size = 0;
    try { size = (await stat(filePath)).size; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (size + Buffer.byteLength(output) > MAX_DIAGNOSTIC_LOG_BYTES) await writeFile(filePath, output, { mode: 0o600 });
    else await appendFile(filePath, output, { mode: 0o600 });
  }

  private control(run: () => Promise<void>, resetsFailure = true) {
    if (this.jobs.filter((job) => !("entry" in job)).length >= 32) return Promise.reject(new Error("DIAGNOSTIC_BUSY"));
    return new Promise<void>((done, fail) => { this.jobs.push({ run, done, fail, resetsFailure }); this.start(); });
  }

  clear(filePath: string) {
    for (const [key, value] of this.repeats) if (value.filePath === filePath || value.filePath === null) this.repeats.delete(key);
    this.dropped.delete(filePath); this.dropped.delete(null);
    return this.control(async () => {
      await validateDiagnosticLogPath(filePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, "", { mode: 0o600 });
    });
  }

  prepare(filePath: string) {
    return this.control(async () => {
      await validateDiagnosticLogPath(filePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await appendFile(filePath, "", { mode: 0o600 });
    });
  }

  async flush() {
    this.flushSummaries();
    if (!this.pathResolver) return;
    const counts = [...this.dropped]; this.dropped.clear();
    for (const [filePath, count] of counts) {
      const entry = makeDiagnosticEntry("log.dropped", { count });
      if (entry) this.jobs.push({ entry, filePath, done: () => undefined });
    }
    await this.control(async () => undefined, false).catch(() => { this.failed = true; });
  }

  async status() { await this.flush(); return { failed: this.failed }; }

  /** 致命异常只做同步尽力落盘，不注册吞异常的 handler，也不延长进程寿命。 */
  fatal(entry: DiagnosticEntry) {
    try {
      const filePath = this.currentPath();
      if (!filePath) return;
      const output = this.serialize(entry);
      if (!output) return;
      mkdirSync(path.dirname(filePath), { recursive: true });
      let size = 0;
      try { size = statSync(filePath).size; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (size) {
        const descriptor = openSync(filePath, "r");
        try {
          const buffer = Buffer.alloc(MAX_DIAGNOSTIC_ENTRY_BYTES);
          const length = readSync(descriptor, buffer, 0, buffer.length, 0);
          if (!isDiagnosticLogEntry(JSON.parse(buffer.toString("utf8", 0, length).split("\n")[0]))) return;
        } finally { closeSync(descriptor); }
      }
      if (size + Buffer.byteLength(output) > MAX_DIAGNOSTIC_LOG_BYTES) writeFileSync(filePath, output, { mode: 0o600 });
      else appendFileSync(filePath, output, { mode: 0o600 });
    } catch { this.failed = true; }
  }
}
