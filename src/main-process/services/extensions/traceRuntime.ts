import { utilityProcess } from "electron";
import type { UtilityProcess } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { TaskSession } from "../../../shared/taskSessionTypes";
import type { TraceQuery, TraceResult, TraceUpdate } from "../../../shared/extensionTypes";
import type { ExtensionService } from "./extensionService";

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
}
interface Lease {
  owner: number;
  sessionId: string;
  runtime: Runtime;
}
const filters = ["all", "user", "assistant", "reasoning", "context", "system", "tool", "error", "compaction", "unknown"];
export function validateTraceQuery(value: TraceQuery) {
  if (
    !value ||
    !["page", "detail", "timeline"].includes(value.kind) ||
    (value.filter !== undefined && !filters.includes(value.filter)) ||
    (value.search !== undefined && (typeof value.search !== "string" || value.search.length > 500)) ||
    (value.offset !== undefined && (!Number.isSafeInteger(value.offset) || value.offset < 0 || value.offset > 10000000)) ||
    (value.limit !== undefined && (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > 200)) ||
    (value.kind === "detail" && (!Number.isSafeInteger(value.eventId) || Number(value.eventId) < 1))
  )
    throw Error("INVALID_QUERY");
}
export class TraceRuntime {
  private runtimes = new Map<string, Runtime>();
  private leases = new Map<string, Lease>();
  private stopping = new Map<string, Promise<void>>();
  private counter = 0;
  constructor(
    private extension: () => ExtensionService,
    private session: (id: string) => Promise<TaskSession | undefined>,
    private notify: (owner: number, update: TraceUpdate) => void,
  ) {}
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
        void this.stop(runtime, "RUNTIME_TIMEOUT").catch(() => undefined);
      }, 120000);
      runtime.pending.set(id, { resolve, reject, timer });
      runtime.process.postMessage({ ...message, id });
    });
  }
  async open(sessionId: string, owner: number) {
    this.requireEnabled();
    if (typeof sessionId !== "string" || sessionId.length > 160 || this.leases.size >= 32) throw Error("INVALID_QUERY");
    const session = await this.session(sessionId);
    if (!session || session.kind !== "agent") throw Error("SESSION_MISSING");
    this.requireEnabled();
    const source = this.describe(session),
      fingerprint = JSON.stringify(source);
    await this.stopping.get(fingerprint);
    this.requireEnabled();
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
        } else if (message.type === "failed") void this.stop(instance, message.error ?? "RUNTIME_FAILED").catch(() => undefined);
        else if (message.type === "changed")
          for (const id of instance.leases) {
            const lease = this.leases.get(id);
            if (lease) this.notify(lease.owner, { leaseId: id });
          }
      });
      child.on("exit", () => {
        if (!instance.dead) {
          this.extension().reportRuntimeFailure();
          void this.stop(instance, "RUNTIME_FAILED").catch(() => undefined);
        }
      });
      runtime.ready = this.send(runtime, { type: "open", session: source, cache });
    }
    const id = randomUUID();
    runtime.leases.add(id);
    this.leases.set(id, { owner, sessionId, runtime });
    try {
      await runtime.ready;
      this.requireEnabled();
      if (!this.leases.has(id)) throw Error("EXTENSION_DISABLED");
      return { id, uiUrl: "navo-extension://session-trace/ui/index.html" };
    } catch (error) {
      this.close(id, owner);
      throw error;
    }
  }
  async query(id: string, query: TraceQuery, owner: number) {
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
    const result = await this.send(lease.runtime, { type: "query", query });
    this.requireEnabled();
    if (!this.leases.has(id)) throw Error("LEASE_EXPIRED");
    return result;
  }
  close(id: string, owner: number) {
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
    for (const [id, lease] of this.leases) if (lease.owner === owner) this.close(id, owner);
  }
  async closeAll() {
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
