import { utilityProcess } from "electron";
import type { UtilityProcess } from "electron";
import { createHash } from "node:crypto";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { TaskSession } from "../../../shared/taskSessionTypes";
import type { TraceQuery, TraceResult, TraceUpdate } from "../../../shared/extensionTypes";
import type { ExtensionService } from "./extensionService";
import { writeDiagnosticEvent } from "../../diagnostics/diagnosticLogger";
import type { DiagnosticEvent, DiagnosticMetadata } from "../../../shared/diagnosticTypes";
import { normalizeExtensionErrorCode } from "../../../shared/extensionErrors";

interface Pending {
  resolve: (value: TraceResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
interface Runtime {
  process: UtilityProcess;
  pending: Map<number, Pending>;
  ready: Promise<unknown>;
  exited: Promise<void>;
  leases: Set<string>;
  dead: boolean;
  fingerprint: string;
  cache: string;
  /** 首个打开者的任务与会话，只用于诊断日志。 */
  taskId: string;
  sessionId: string;
}
interface Lease {
  owner: number;
  sessionId: string;
  taskId: string;
  runtime: Runtime;
}
interface PendingOpen {
  owner: number;
  cancelled: boolean;
  /** 打开失败时诊断日志需要的任务 ID。 */
  context: { taskId?: string };
}
const filters = ["all", "user", "assistant", "reasoning", "context", "system", "tool", "error", "compaction", "unknown"];
export function validateTraceQuery(value: TraceQuery) {
  if (
    !value ||
    !["page", "detail", "timeline"].includes(value.kind) ||
    // contextBridge 会把未设置的可选字段变成 null，统一按缺省处理。
    (value.filter != null && !filters.includes(value.filter)) ||
    (value.search != null && (typeof value.search !== "string" || value.search.length > 500)) ||
    (value.offset != null && (!Number.isSafeInteger(value.offset) || value.offset < 0 || value.offset > 10000000)) ||
    (value.limit != null && (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > 200)) ||
    (value.showBookkeeping != null && typeof value.showBookkeeping !== "boolean") ||
    (value.eventId != null && (!Number.isSafeInteger(value.eventId) || Number(value.eventId) < 1)) ||
    (value.kind === "detail" && value.eventId == null)
  )
    throw Error("INVALID_QUERY");
}
export class TraceRuntime {
  private runtimes = new Map<string, Runtime>();
  private leases = new Map<string, Lease>();
  private opening = new Map<string, PendingOpen>();
  private stopping = new Map<string, Promise<void>>();
  private counter = 0;
  constructor(
    private extension: () => ExtensionService,
    private session: (id: string) => Promise<TaskSession | undefined>,
    private notify: (owner: number, update: TraceUpdate) => void,
  ) {}
  /** 宿主统一记录轨迹失败：只写错误码与 ID，不写轨迹正文、查询词或路径。 */
  private report(event: DiagnosticEvent, error: unknown, metadata: DiagnosticMetadata = {}) {
    const code = normalizeExtensionErrorCode(error instanceof Error ? error.message : error);
    // 关闭面板时的竞态取消属于正常流程，不写日志。
    if (code === "LEASE_EXPIRED") return;
    const logged = Error(code);
    if (error instanceof Error && error.stack) logged.stack = error.stack;
    void writeDiagnosticEvent(event, {
      extensionId: "session-trace",
      version: this.extension().status.version ?? undefined,
      ...metadata,
      error: logged,
    });
  }
  private requireEnabled() {
    const status = this.extension().status;
    if (!status.enabled || !status.compatible || status.operation !== "idle") throw Error("EXTENSION_DISABLED");
  }
  private describe(session: TaskSession) {
    if (!session.nativeSessionId) throw Error("IDENTITY_PENDING");
    const provider = session.agent?.agentId;
    if (provider !== "claude" && provider !== "codex") throw Error("UNSUPPORTED_PROVIDER");
    const root = session.nativeHistoryRoot || path.join(os.homedir(), provider === "claude" ? ".claude" : ".codex");
    return { id: session.nativeSessionId, provider, root, cwd: session.cwd, createdAt: session.nativeLaunchAt ?? session.createdAt };
  }
  private send(runtime: Runtime, message: Record<string, unknown>): Promise<TraceResult> {
    if (runtime.dead) return Promise.reject(Error("RUNTIME_FAILED"));
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        runtime.pending.delete(id);
        reject(Error("RUNTIME_TIMEOUT"));
        this.report("trace.runtime_exited", "RUNTIME_TIMEOUT", { taskId: runtime.taskId, sessionId: runtime.sessionId });
        void this.stop(runtime, "RUNTIME_TIMEOUT").catch(() => undefined);
      }, 120000);
      runtime.pending.set(id, { resolve, reject, timer });
      runtime.process.postMessage({ ...message, id });
    });
  }
  async open(sessionId: string, owner: number, id: string) {
    const context: { taskId?: string } = {};
    try {
      return await this.openChecked(sessionId, owner, id, context);
    } catch (error) {
      this.report("trace.open_failed", error, { sessionId, taskId: context.taskId });
      throw error;
    }
  }
  private async openChecked(sessionId: string, owner: number, id: string, context: { taskId?: string }) {
    this.requireEnabled();
    const leaseCount = new Set([...this.leases.keys(), ...this.opening.keys()]).size;
    if (
      typeof sessionId !== "string" || sessionId.length > 160 || leaseCount >= 32 ||
      typeof id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) ||
      this.leases.has(id) || this.opening.has(id)
    ) throw Error("INVALID_QUERY");
    const opening: PendingOpen = { owner, cancelled: false, context };
    // 先登记请求，元数据读取、等待旧进程退出和首次索引期间均允许取消。
    this.opening.set(id, opening);
    try {
      return await this.openLease(sessionId, owner, id, opening);
    } finally {
      this.opening.delete(id);
    }
  }
  private async openLease(sessionId: string, owner: number, id: string, opening: PendingOpen) {
    const requireActive = () => {
      if (opening.cancelled) throw Error("LEASE_EXPIRED");
      this.requireEnabled();
    };
    const session = await this.session(sessionId);
    requireActive();
    if (!session || session.kind !== "agent") throw Error("SESSION_MISSING");
    opening.context.taskId = session.taskId;
    const source = this.describe(session),
      fingerprint = JSON.stringify(source);
    await this.stopping.get(fingerprint);
    requireActive();
    let runtime = this.runtimes.get(fingerprint);
    if (!runtime) {
      const cache = path.join(
        this.extension().directory,
        "cache",
        createHash("sha256")
          .update(fingerprint + ":" + this.extension().status.version)
          .digest("hex") + ".sqlite",
      );
      const child = utilityProcess.fork(path.join(this.extension().installedDirectory, "runtime/index.cjs"), [], {
        stdio: "ignore",
        serviceName: "Navo Session Trace",
      });
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      runtime = {
        process: child,
        pending: new Map(),
        ready: Promise.resolve(),
        exited,
        leases: new Set(),
        dead: false,
        fingerprint,
        cache,
        taskId: session.taskId,
        sessionId,
      };
      this.runtimes.set(fingerprint, runtime);
      const instance = runtime;
      child.on("message", (message: { id?: number; result?: TraceResult; error?: string; type?: string }) => {
        if (instance.dead) return;
        if (message.id) {
          const pending = instance.pending.get(message.id);
          if (!pending) return;
          clearTimeout(pending.timer);
          instance.pending.delete(message.id);
          if (message.error) pending.reject(Error(message.error));
          else pending.resolve(message.result as TraceResult);
        } else if (message.type === "failed") {
          this.report("trace.runtime_exited", message.error ?? "RUNTIME_FAILED", { taskId: instance.taskId, sessionId: instance.sessionId });
          void this.stop(instance, message.error ?? "RUNTIME_FAILED").catch(() => undefined);
        }
        else if (message.type === "changed")
          for (const id of instance.leases) {
            const lease = this.leases.get(id);
            if (lease) this.notify(lease.owner, { leaseId: id });
          }
      });
      child.on("exit", (exitCode) => {
        if (!instance.dead) {
          this.report("trace.runtime_exited", "RUNTIME_FAILED", { taskId: instance.taskId, sessionId: instance.sessionId, exitCode });
          this.extension().reportRuntimeFailure();
          void this.stop(instance, "RUNTIME_FAILED").catch(() => undefined);
        }
      });
      runtime.ready = this.send(runtime, { type: "open", session: source, cache });
    }
    runtime.leases.add(id);
    this.leases.set(id, { owner, sessionId, taskId: session.taskId, runtime });
    try {
      await runtime.ready;
      requireActive();
      if (!this.leases.has(id)) throw Error("EXTENSION_DISABLED");
      return { id };
    } catch (error) {
      this.close(id, owner);
      throw error;
    }
  }
  async query(id: string, query: TraceQuery, owner: number) {
    const lease = this.leases.get(id);
    try {
      return await this.queryChecked(id, query, owner);
    } catch (error) {
      const queryKind = typeof query?.kind === "string" ? query.kind : undefined;
      this.report("trace.query_failed", error, lease?.owner === owner ? { taskId: lease.taskId, sessionId: lease.sessionId, queryKind } : { queryKind });
      throw error;
    }
  }
  private async queryChecked(id: string, query: TraceQuery, owner: number) {
    this.requireEnabled();
    validateTraceQuery(query);
    const lease = this.leases.get(id);
    if (!lease || lease.owner !== owner) throw Error("LEASE_EXPIRED");
    const session = await this.session(lease.sessionId);
    if (!session || JSON.stringify(this.describe(session)) !== lease.runtime.fingerprint) {
      this.close(id, owner);
      throw Error("SESSION_MISSING");
    }
    this.requireEnabled();
    // 去掉 contextBridge 产生的 null，解析进程只看到缺省或有效值。
    const normalized = Object.fromEntries(Object.entries(query).filter(([, value]) => value != null)) as TraceQuery;
    const result = await this.send(lease.runtime, { type: "query", query: normalized });
    this.requireEnabled();
    if (!this.leases.has(id)) throw Error("LEASE_EXPIRED");
    return result;
  }
  close(id: string, owner: number) {
    const opening = this.opening.get(id);
    if (opening?.owner === owner) opening.cancelled = true;
    const lease = this.leases.get(id);
    if (!lease || lease.owner !== owner) return;
    this.leases.delete(id);
    lease.runtime.leases.delete(id);
    if (!lease.runtime.leases.size)
      void this.stop(lease.runtime)
        .then(() => this.pruneCache())
        .catch(() => undefined);
  }
  closeOwner(owner: number) {
    for (const [id, opening] of this.opening) if (opening.owner === owner) this.close(id, owner);
    for (const [id, lease] of this.leases) if (lease.owner === owner) this.close(id, owner);
  }
  async closeAll() {
    for (const opening of this.opening.values()) opening.cancelled = true;
    await Promise.all([...this.runtimes.values()].map((runtime) => this.stop(runtime, "EXTENSION_DISABLED")));
    await Promise.all(this.stopping.values());
  }
  private stop(runtime: Runtime, error?: string): Promise<void> {
    if (runtime.dead) return this.stopping.get(runtime.fingerprint) ?? Promise.resolve();
    runtime.dead = true;
    runtime.process.kill();
    this.runtimes.delete(runtime.fingerprint);
    for (const pending of runtime.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(Error(error ?? "LEASE_EXPIRED"));
    }
    runtime.pending.clear();
    for (const id of runtime.leases) {
      const lease = this.leases.get(id);
      if (lease && error) this.notify(lease.owner, { leaseId: id, error });
      this.leases.delete(id);
    }
    runtime.leases.clear();
    const stopped = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("RUNTIME_FAILED")), 5000);
      void runtime.exited.then(() => {
        clearTimeout(timer);
        resolve();
      });
    }).finally(() => this.stopping.delete(runtime.fingerprint));
    this.stopping.set(runtime.fingerprint, stopped);
    return stopped;
  }
  private async pruneCache() {
    const directory = path.join(this.extension().directory, "cache"),
      active = new Set([...this.runtimes.values()].map((value) => value.cache));
    const names = await readdir(directory).catch(() => []);
    const files = (
      await Promise.all(
        names
          .filter((name) => /^[a-f0-9]{64}\.sqlite$/.test(name))
          .map(async (name) => {
            const filename = path.join(directory, name);
            const info = await stat(filename).catch(() => null);
            return info && { filename, size: info.size, time: info.mtimeMs };
          }),
      )
    )
      .filter((value): value is { filename: string; size: number; time: number } => Boolean(value))
      .sort((a, b) => b.time - a.time);
    let total = 0;
    for (const [index, file] of files.entries()) {
      total += file.size;
      if ((index >= 8 || total > 256 * 1024 * 1024) && !active.has(file.filename))
        await rm(file.filename, { force: true }).catch(() => undefined);
    }
  }
}
