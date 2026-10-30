import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { stat } from "node:fs/promises";
import type { WebContents } from "electron";
import type { Task } from "../../../domain/tasks";
import { agentNames } from "../../../domain/agents";
import type { AppSettings } from "../../../domain/types";
import type { ResourceCommand, ResourceRecord } from "../../../shared/settingsTypes";
import { resolveTaskCommand, taskCommandArguments } from "./taskCommand";
import type { StartTaskSessionInput, TaskSession } from "../../../shared/taskSessionTypes";
import { defaultAgentSelection, isTaskAgentSelection } from "../../../utils/taskAgentSelection";
import { resolveSessionWorkspace } from "../../../utils/taskSessionWorkspace";
import { readLegacySessionWorkspace } from "./legacySessionWorkspace";
import { requireAgentId } from "../agents/agentRepository";
import type { AgentService } from "../agents/agentService";
import { createTerminal, destroyTerminal, resolveShell } from "../terminal/terminalService";
import { SessionRepository } from "./sessionRepository";
import { prepareTaskContext, taskPrompt } from "./taskContext";
import { prepareAgentLaunch } from "./agentLaunch";
import { writeDiagnosticEvent } from "../../diagnostics/diagnosticLogger";
import { readNativeSessionTitle } from "./nativeSessionTitle";
import { canManageNativeSession, nativeActionEnvironment, removeNativeSession, renameNativeSession, requireSessionName } from "./nativeSessionActions";
import { TaskContextServer } from "./taskContextServer";
import { TaskContextFiles } from "./taskContextFiles";

const MAX_SESSIONS = 32;
const ACTIVITY_FLUSH_DELAY_MS = 1000;
export class TaskSessionService {
  private sessions: TaskSession[] = [];
  private owners = new Map<string, number>();
  private boundOwners = new Set<number>();
  private shellNumbers = new Map<string, number>();
  private loaded = false;
  private queue: Promise<unknown> = Promise.resolve();
  private closing = false;
  private titleTimer: NodeJS.Timeout | null = null;
  private titleEnvironments = new Map<string, NodeJS.ProcessEnv>();
  private activityTimer: NodeJS.Timeout | null = null;
  private activeSessions = new Set<TaskSession>();
  private readonly contextServer: TaskContextServer;
  private readonly contextFiles = new TaskContextFiles();
  constructor(private readonly repository: SessionRepository, private readonly agents: AgentService,
    private readonly loadTask: (id: string) => Promise<Task>, private readonly settings: () => AppSettings,
    private readonly changed: (sessions: TaskSession[]) => void,
    private readonly attachmentPaths: (task: Task) => Promise<string[]> = async () => [],
    private readonly readTitle = readNativeSessionTitle,
    private readonly nativeActions = { environment: nativeActionEnvironment, rename: renameNativeSession, remove: removeNativeSession },
    private readonly loadResources: () => Promise<ResourceRecord[]> = async () => []) {
    this.contextServer = new TaskContextServer(loadTask, attachmentPaths);
  }

  private serialize<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async initialize() {
    if (this.loaded) return;
    this.sessions = await this.repository.load();
    for (const session of this.sessions) if (session.kind === "agent" && session.agent) {
      if (!session.workspace && session.cwd) {
        try {
          const task = await this.loadTask(session.taskId);
          const workspace = await readLegacySessionWorkspace(task, session.cwd, this.settings().tasksDirectory);
          if (workspace) { session.workspace = workspace; await this.repository.save(session, { preserveUpdateTime: true }); }
        } catch { /* 无法确认旧会话范围时，不以当前资源数量推断。 */ }
      }
      const prefix = agentNames[session.agent.agentId] + " ";
      if (session.titleSource !== "cli" && session.title?.startsWith(prefix) && /^\d+$/.test(session.title.slice(prefix.length))) {
        session.title = "";
        await this.repository.save(session, { preserveUpdateTime: true });
      }
    }
    for (const session of this.sessions) if (session.status === "starting" || session.status === "running") {
      session.status = "stopped";
      await this.repository.save(session, { preserveUpdateTime: true });
    }
    this.loaded = true;
    await this.refreshTitles();
    this.scheduleTitles();
  }
  private async refreshTitles() {
    let changed = false;
    for (const session of this.sessions) {
      if (session.kind !== "agent" || session.archivedAt) continue;
      const title = await this.readTitle(session, this.titleEnvironments.get(session.id));
      if (!title || (title === session.title && session.titleSource === "cli")) continue;
      const updated = { ...session, title, titleSource: "cli" as const };
      await this.repository.save(updated);
      session.title = title;
      session.titleSource = "cli";
      session.lastUpdateAt = updated.lastUpdateAt;
      changed = true;
    }
    if (changed) this.publish();
  }
  private scheduleTitles() {
    if (this.closing || this.titleTimer) return;
    this.titleTimer = setTimeout(() => {
      this.titleTimer = null;
      void this.serialize(() => this.refreshTitles()).catch(() => undefined).finally(() => this.scheduleTitles());
    }, 5000);
    this.titleTimer.unref();
  }
  list() { return this.serialize(async () => { await this.initialize(); return this.sessions; }); }
  private publish() { this.changed(this.sessions); return this.sessions; }
  private async save(session: TaskSession) { await this.repository.save(session); this.publish(); }

  /** 只同步提交后的任务数据，不向 PTY 写入文本，也不推断 CLI 正处于哪种输入状态。 */
  updateTaskContext(taskId: string) {
    return this.serialize(async () => {
      if (this.closing) return;
      const targets = this.sessions.filter((session) => session.taskId === taskId && session.contextMode === "file"
        && !session.archivedAt && ["starting", "running"].includes(session.status) && this.contextFiles.has(session.id));
      if (!targets.length) return;
      try {
        // 不使用事件携带的旧快照，多个连续保存合并读取数据库最新内容。
        const task = await this.loadTask(taskId);
        const attachments = task.status === "ARCHIVED" ? [] : await this.attachmentPaths(task);
        for (const session of targets) {
          try { await this.contextFiles.update(session.id, task, attachments); session.contextSyncFailed = false; }
          catch (error) { this.contextSyncFailure(session, error); }
        }
      } catch (error) { for (const session of targets) this.contextSyncFailure(session, error); }
      this.publish();
    });
  }
  contextReminder(id: string, owner: WebContents) {
    return this.serialize(async () => {
      const session = this.owned(id, owner);
      if (this.closing || session.contextMode !== "file" || session.archivedAt || session.status !== "running") throw new Error("SESSION_CONTEXT_UNAVAILABLE");
      const task = await this.loadTask(session.taskId);
      if (task.status === "ARCHIVED") throw new Error("SESSION_CONTEXT_UNAVAILABLE");
      try {
        await this.contextFiles.update(session.id, task, await this.attachmentPaths(task), true);
        session.contextSyncFailed = false;
        return this.contextFiles.instructions(session.id);
      } catch (error) { this.contextSyncFailure(session, error); throw error; }
      finally { this.publish(); }
    });
  }
  private async releaseContext(session: TaskSession) {
    this.contextServer.revoke(session.id);
    await this.contextFiles.release(session.id);
  }
  private contextSyncFailure(session: TaskSession, error: unknown) {
    if (!session.contextSyncFailed) void writeDiagnosticEvent("session.context.sync_failed", { taskId: session.taskId, operationId: session.id, error });
    session.contextSyncFailed = true;
  }

  private recordActivity(session: TaskSession, terminalId: string) {
    if (this.closing || session.kind !== "agent" || session.archivedAt || !this.sessions.includes(session)
      || session.terminalId !== terminalId || !["starting", "running"].includes(session.status)) return;
    session.lastActiveAt = new Date().toISOString();
    this.activeSessions.add(session);
    this.scheduleActivityFlush();
  }
  private scheduleActivityFlush() {
    if (this.closing || this.activityTimer || !this.activeSessions.size) return;
    this.activityTimer = setTimeout(() => {
      this.activityTimer = null;
      void this.serialize(() => this.flushActivity()).catch((error) => {
        void writeDiagnosticEvent("session.activity.failed", { error });
      }).finally(() => this.scheduleActivityFlush());
    }, ACTIVITY_FLUSH_DELAY_MS);
    this.activityTimer.unref();
  }
  private async flushActivity() {
    // 输入输出只更新内存，合并落库；写入失败保留待保存记录，下一轮重试。
    const pending = [...this.activeSessions];
    for (const session of pending) {
      this.activeSessions.delete(session);
      if (!this.sessions.includes(session)) continue;
      try { await this.repository.save(session); }
      catch (error) { this.activeSessions.add(session); throw error; }
    }
    if (pending.length) this.publish();
  }

  start(input: StartTaskSessionInput, owner: WebContents, initial = false, initialization?: { command: ResourceCommand; finished: (code: number | null) => void }) {
    return this.serialize(async () => {
      await this.initialize();
      if (this.closing || owner.isDestroyed()) throw new Error("SESSION_UNAVAILABLE");
      if (!input || !["agent", "shell"].includes(input.kind) || typeof input.taskId !== "string") throw new Error("TASK_INVALID");
      const task = await this.loadTask(input.taskId);
      if (task.status === "ARCHIVED") throw new Error(input.commandId ? "SESSION_COMMAND_UNAVAILABLE" : "SESSION_BUSY");
      if (input.kind === "agent" && task.initialization?.some((step) => step.status !== "succeeded")) throw new Error("SESSION_INITIALIZATION_REQUIRED");
      const workspace = resolveSessionWorkspace(task.resources ?? [], input.resourceId);
      const command = initialization?.command ?? (input.commandId !== undefined ? await resolveTaskCommand(task, input, await this.loadResources()) : undefined);
      if (command) {
        const running = this.sessions.find((session) => session.taskId === task.id && session.command?.id === command.id && session.command.resourceId === input.resourceId && ["starting", "running"].includes(session.status));
        if (running) { this.owned(running.id, owner);return this.sessions; }
      }
      if (initial && this.sessions.some((session) => session.taskId === task.id && session.kind === "agent")) return this.sessions;
      if (this.sessions.filter((session) => session.status === "running" || session.status === "starting").length >= MAX_SESSIONS) throw new Error("SESSION_LIMIT");
      if (input.agentId !== undefined) requireAgentId(input.agentId);
      if (input.agentId !== undefined && (input.agent || input.kind !== "agent")) throw new Error("TASK_INVALID");
      const agent = input.agentId ? defaultAgentSelection(await this.agents.capabilities(input.agentId)) : input.agent ?? task.agent;
      if (input.kind === "agent" && !isTaskAgentSelection(agent)) throw new Error("AGENT_UNAVAILABLE");
      const number = (this.shellNumbers.get(task.id) ?? 0) + 1;
      if (input.kind === "shell") this.shellNumbers.set(task.id, number);
      const createdAt = new Date().toISOString();
      const session: TaskSession = { id: randomUUID(), taskId: task.id, kind: input.kind,
        ...(initialization ? { initialization: true } : {}),
        title: command?.name ?? (input.kind === "shell" ? `${path.basename(resolveShell())}${number}` : ""),
        ...(command ? { command: { id: command.id, resourceId: input.resourceId as string, name: command.name } } : {}),
        cwd: "", workspace, agent: input.kind === "agent" ? agent : undefined, status: "starting", terminalId: "task-" + randomUUID(),
        nativeSessionId: randomUUID(), resumable: false, createdAt, lastUpdateAt: createdAt, lastActiveAt: createdAt };
      this.sessions = [...this.sessions, session];
      this.bindOwner(session.id, owner);
      try { await this.save(session); }
      catch (error) { session.status = "failed"; session.error = "SESSION_STORAGE_FAILED"; this.publish(); throw error; }
      await this.launch(session, task, owner, false, input.resourceId, command, initialization?.finished);
      return this.publish();
    });
  }

  private async launch(session: TaskSession, task: Task, owner: WebContents, resume: boolean, resourceId?: string | null, command?: ResourceCommand, finished?: (code: number | null) => void) {
    void writeDiagnosticEvent("session.start.started", { taskId: task.id, operationId: session.id });
    try {
      const directoryId = session.workspace?.kind === "resource" ? session.workspace.resourceId : session.workspace?.kind === "all" ? null : resourceId;
      const context = session.cwd ? { cwd: session.cwd, prompt: taskPrompt(task) } : await prepareTaskContext(task, this.settings().tasksDirectory, directoryId);
      if (session.agent) context.prompt += "\nAttachments (reference files):\n" + (await this.attachmentPaths(task)).map((filename) => JSON.stringify(filename)).join("\n");
      session.cwd = context.cwd;
      if (!(await stat(session.cwd)).isDirectory()) throw new Error("SESSION_DIRECTORY_MISSING");
      if (!session.nativeSessionId) throw new Error("SESSION_UNAVAILABLE");
      const launch = session.agent ? await prepareAgentLaunch(this.agents, session.agent, session.nativeSessionId, context.prompt, resume, session.nativeHistoryRoot,
        () => this.contextServer.connect(session.id, task.id), taskPrompt(task, false), async () => {
          const current = await this.loadTask(task.id);
          if (current.status === "ARCHIVED") throw new Error("SESSION_BUSY");
          return this.contextFiles.prepare(session.id, current, this.settings().tasksDirectory, await this.attachmentPaths(current));
        }) : undefined;
      if (launch) session.contextMode = launch.contextMode;
      delete session.contextSyncFailed;
      if (launch) this.titleEnvironments.set(session.id, { GROK_HOME: launch.env.GROK_HOME, CLAUDE_CONFIG_DIR: launch.env.CLAUDE_CONFIG_DIR });
      if (launch && session.agent?.agentId === "grok") session.nativeHistoryRoot = launch.env.GROK_HOME || path.join(os.homedir(), ".grok");
      if (launch && session.agent?.agentId === "claude") session.nativeHistoryRoot = launch.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
      if (this.closing || owner.isDestroyed()) throw new Error("SESSION_UNAVAILABLE");
      const terminalId = session.terminalId;
      createTerminal({ sessionId: terminalId, cwd: session.cwd, cols: 80, rows: 24 }, owner, {
        strictCwd: true,
        command: launch?.command ?? resolveShell(), args: command ? taskCommandArguments(command.script) : launch?.args ?? (process.platform === "win32" ? [] : ["-l"]), env: launch?.env ?? process.env,
        retainOnExit: Boolean(command),
        onActivity: () => this.recordActivity(session, terminalId),
        onFinish: () => {
          if (session.terminalId === terminalId) this.contextServer.revoke(session.id);
          // 正常退出同一轮还会触发 onExit；关闭/强停只有 onFinish。
          queueMicrotask(() => finished?.(null));
          void this.serialize(async () => {
            if (!this.sessions.includes(session) || session.terminalId !== terminalId) return;
            await this.contextFiles.release(session.id);
            if (!["running", "starting"].includes(session.status)) return;
            session.status = "stopped";
            await this.save(session);
          }).catch(() => undefined);
        },
        onExit: (code) => {
          finished?.(code);
          void this.serialize(async () => {
            if (!this.sessions.includes(session) || session.archivedAt || session.terminalId !== terminalId) return;
            await this.releaseContext(session);
            session.status = code === 0 ? "stopped" : "failed";
            if (session.command) session.commandExitCode = code;
            if (code !== 0) session.error = "SESSION_EXIT_FAILED";
            await this.save(session);
          }).catch(() => undefined);
        },
      });
      session.status = "running";
      this.recordActivity(session, terminalId);
      session.resumable = session.agent?.agentId === "claude" || session.agent?.agentId === "grok";
      delete session.error;
      await this.save(session);
      void writeDiagnosticEvent("session.start.succeeded", { taskId: task.id, operationId: session.id });
    } catch (error) {
      finished?.(null);
      await this.releaseContext(session);
      destroyTerminal({ sessionId: session.terminalId }, owner.id);
      session.status = "failed";
      const code = error instanceof Error ? error.message : "";
      session.error = /^(SESSION_[A-Z_]+|AGENT_UNAVAILABLE)$/.test(code) ? code : "SESSION_START_FAILED";
      await this.save(session);
      void writeDiagnosticEvent("session.start.failed", { taskId: task.id, operationId: session.id, error });
    }
  }

  stop(id: string, owner: WebContents) {
    return this.serialize(async () => {
      await this.initialize();
      const session = this.owned(id, owner);
      session.status = "stopped";
      await this.releaseContext(session);
      destroyTerminal({ sessionId: session.terminalId }, owner.id);
      void writeDiagnosticEvent("session.stop.succeeded", { taskId: session.taskId, operationId: session.id });
      if (session.kind === "shell") { this.sessions = this.sessions.filter((item) => item.id !== id); this.owners.delete(id); }
      else await this.repository.save(session);
      return this.publish();
    });
  }
  restart(id: string, resume: boolean, owner: WebContents) {
    return this.serialize(async () => {
      await this.initialize();
      const session = this.owned(id, owner);
      if (this.closing || session.archivedAt || session.kind !== "agent" || (resume && ["starting", "running"].includes(session.status))) throw new Error("SESSION_BUSY");
      if (resume && !session.resumable) throw new Error("SESSION_RESUME_UNSUPPORTED");
      const task = await this.loadTask(session.taskId);
      // 重启在同一串行操作内先停止旧进程，旧 PTY 的延迟回调不能覆盖新实例。
      if (task.status === "ARCHIVED") throw new Error("SESSION_BUSY");
      if (task.initialization?.some((step) => step.status !== "succeeded")) throw new Error("SESSION_INITIALIZATION_REQUIRED");
      if (session.workspace?.kind === "resource" && !task.resources?.some((resource) => session.workspace?.kind === "resource" && resource.resourceId === session.workspace.resourceId)) throw new Error("SESSION_DIRECTORY_MISSING");
      if (!resume) {
        session.status = "stopped";
        await this.releaseContext(session);
        destroyTerminal({ sessionId: session.terminalId }, owner.id);
        await this.save(session);
      }
      if (!resume) { session.nativeSessionId = randomUUID(); session.resumable = false; session.title = ""; delete session.titleSource; }
      session.terminalId = "task-" + randomUUID(); session.status = "starting";
      this.bindOwner(id, owner);
      await this.save(session);
      await this.launch(session, task, owner, resume);
      return this.publish();
    });
  }
  private owned(id: string, owner: WebContents) {
    const session = this.sessions.find((item) => item.id === id);
    const ownerId = this.owners.get(id);
    if (!session || (ownerId !== undefined && ownerId !== owner.id)) throw new Error("SESSION_UNAVAILABLE");
    return session;
  }
  archive(id: string, owner: WebContents) {
    return this.serialize(async () => {
      await this.initialize();
      const session = this.owned(id, owner);
      if (session.kind !== "agent") throw new Error("SESSION_UNAVAILABLE");
      if (session.archivedAt) return this.sessions;
      session.status = "stopped";
      await this.releaseContext(session);
      destroyTerminal({ sessionId: session.terminalId }, owner.id);
      const archived = { ...session, archivedAt: new Date().toISOString() };
      try {
        await this.repository.save(archived);
        session.archivedAt = archived.archivedAt;
        session.lastUpdateAt = archived.lastUpdateAt;
        this.titleEnvironments.delete(id);
      } finally { this.publish(); }
      return this.sessions;
    });
  }
  restore(id: string, owner: WebContents) {
    return this.serialize(async () => {
      await this.initialize();
      const session = this.owned(id, owner);
      if ((await this.loadTask(session.taskId)).status === "ARCHIVED") throw new Error("SESSION_BUSY");
      if (session.kind !== "agent") throw new Error("SESSION_UNAVAILABLE");
      if (!session.archivedAt) return this.sessions;
      const restored = { ...session, status: "stopped" as const, terminalId: "task-" + randomUUID() };
      delete restored.archivedAt;
      await this.repository.save(restored);
      Object.assign(session, restored); delete session.archivedAt;
      this.bindOwner(id, owner);
      return this.publish();
    });
  }
  withIdleWorkspace<Result>(taskId: string, resourceId: string, operation: () => Promise<Result>) {
    return this.serialize(async () => {
      await this.initialize();
      if (this.sessions.some((session) => session.taskId === taskId && ["starting", "running"].includes(session.status)
        && (session.workspace?.kind !== "resource" || session.workspace.resourceId === resourceId))) throw new Error("TASK_WORKSPACE_BUSY");
      return operation();
    });
  }
  stopInitialization(taskId: string) {
    return this.serialize(async () => {
      for (const session of this.sessions) if (session.taskId === taskId && session.initialization && ["starting", "running"].includes(session.status)) {
        session.status = "failed";
        await this.releaseContext(session);
        destroyTerminal({ sessionId: session.terminalId });
      }
      this.publish();
    });
  }
  rename(id: string, title: string, owner: WebContents) {
    return this.serialize(async () => {
      await this.initialize(); requireSessionName(title);
      const session = this.owned(id, owner);
      if (!canManageNativeSession(session) || session.archivedAt) throw new Error("SESSION_NATIVE_UNSUPPORTED");
      const { env } = await this.nativeActions.environment(this.agents, session);
      session.status = "stopped";
      await this.releaseContext(session);
      destroyTerminal({ sessionId: session.terminalId }, owner.id);
      await this.repository.save(session);
      try {
        await this.nativeActions.rename(session, title, env);
        session.title = title.trim(); session.titleSource = "cli";
        await this.repository.save(session);
      } finally { this.publish(); }
      return this.sessions;
    });
  }
  remove(id: string, owner: WebContents) {
    return this.serialize(async () => {
      await this.initialize();
      const session = this.owned(id, owner);
      if (!canManageNativeSession(session)) throw new Error("SESSION_NATIVE_UNSUPPORTED");
      const { env, grokBinary } = await this.nativeActions.environment(this.agents, session);
      session.status = "stopped";
      await this.releaseContext(session);
      destroyTerminal({ sessionId: session.terminalId }, owner.id);
      await this.repository.save(session);
      try {
        await this.nativeActions.remove(session, env, grokBinary);
        await this.repository.remove(id);
        this.sessions = this.sessions.filter((item) => item.id !== id);
        this.owners.delete(id); this.titleEnvironments.delete(id);
      } finally { this.publish(); }
      return this.sessions;
    });
  }
  private bindOwner(id: string, owner: WebContents) {
    this.owners.set(id, owner.id);
    if (this.boundOwners.has(owner.id)) return;
    this.boundOwners.add(owner.id);
    owner.once("destroyed", () => {
      void this.serialize(async () => {
        for (const session of this.sessions) if (this.owners.get(session.id) === owner.id) {
          await this.releaseContext(session);
          destroyTerminal({ sessionId: session.terminalId }, owner.id);
          session.status = "stopped"; this.owners.delete(session.id);
          await this.repository.save(session);
        }
        this.sessions = this.sessions.filter((session) => session.kind !== "shell" || this.owners.has(session.id));
        this.boundOwners.delete(owner.id); this.publish();
      }).catch(() => undefined);
    });
  }
  deleteTask<Result>(taskId: string, operation: () => Promise<Result>) {
    return this.serialize(async () => {
      await this.initialize();
      for (const session of this.sessions.filter((item) => item.taskId === taskId)) {
        session.status = "stopped";
        await this.releaseContext(session);
        destroyTerminal({ sessionId: session.terminalId }); this.owners.delete(session.id);
        await this.repository.save(session);
      }
      try {
        const result = await operation();
        this.sessions = this.sessions.filter((item) => item.taskId !== taskId);
        return result;
      } finally { this.publish(); }
    });
  }
  async shutdown() {
    this.closing = true;
    if (this.titleTimer) clearTimeout(this.titleTimer);
    this.titleTimer = null;
    if (this.activityTimer) clearTimeout(this.activityTimer);
    this.activityTimer = null;
    await this.serialize(() => this.flushActivity()).catch((error) => writeDiagnosticEvent("session.activity.failed", { error }));
    await this.queue;
    await this.contextServer.close();
    await this.contextFiles.close();
  }
}
