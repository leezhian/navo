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
import { canAutoResumeSession } from "../../../utils/taskSessionResume";
import { readLegacySessionWorkspace } from "./legacySessionWorkspace";
import { sessionFromSource } from "./sessionFromSource";
import { requireAgentId } from "../agents/agentRepository";
import type { AgentService } from "../agents/agentService";
import { createTerminal, destroyTerminal, resolveShell } from "../terminal/terminalService";
import { SessionRepository } from "./sessionRepository";
import { prepareTaskContext, taskPrompt } from "./taskContext";
import { prepareAgentLaunch } from "./agentLaunch";
import { writeDiagnosticEvent } from "../../diagnostics/diagnosticLogger";
import { readNativeSessionActivity } from "./nativeSessionActivity";
import { readNativeSessionTitle } from "./nativeSessionTitle";
import { readNativeSessionBinding } from "./nativeSessionBinding";
import { canManageNativeSession, nativeActionEnvironment, removeNativeSession, renameNativeSession, requireSessionName } from "./nativeSessionActions";
import { TaskContextServer } from "./taskContextServer";
import { TaskContextFiles } from "./taskContextFiles";
import { SessionWorkspaceMcp } from "./sessionWorkspaceMcp";
import type { TaskContextNoteActions } from "./taskNoteTools";

const MAX_SESSIONS = 32;
const ACTIVITY_FLUSH_DELAY_MS = 1000;
const RUNTIME_REFRESH_DELAY_MS = 5000;
export class TaskSessionService {
  private sessions: TaskSession[] = [];
  private owners = new Map<string, number>();
  private boundOwners = new Set<number>();
  private shellNumbers = new Map<string, number>();
  private loaded = false;
  private queue: Promise<unknown> = Promise.resolve();
  private closing = false;
  private runtimeTimer: NodeJS.Timeout | null = null;
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
    private readonly loadResources: () => Promise<ResourceRecord[]> = async () => [],
    noteActions?: TaskContextNoteActions,
    private readonly readActivity = readNativeSessionActivity,
    private readonly workspaceMcp = new SessionWorkspaceMcp()) {
    this.contextServer = new TaskContextServer(loadTask, attachmentPaths, noteActions);
  }

  private serialize<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async initialize() {
    if (this.loaded) return;
    await this.workspaceMcp.reapAntigravity().catch((error) => { void writeDiagnosticEvent("session.context.sync_failed", { error }); });
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
    this.scheduleRuntimeRefresh();
  }
  /** 详情进入时只读取该任务的原生标题；普通列表加载使用已保存的名称。 */
  refreshTitles(taskId: string) {
    return this.serialize(async () => {
      await this.initialize();
      if (typeof taskId !== "string" || !taskId) throw new Error("TASK_INVALID");
      await this.loadTask(taskId);
      for (const session of this.sessions) if (session.taskId === taskId) {
        await this.refreshNativeMetadata(session);
        await this.refreshRecordedActivity(session);
      }
      return this.publish();
    });
  }
  private async refreshNativeMetadata(session: TaskSession) {
    if (session.kind !== "agent" || session.archivedAt) return false;
    const native = await readNativeSessionBinding(session);
    const bindingChanged = Boolean(native && !session.resumable);
    const title = native?.title || await this.readTitle(session, this.titleEnvironments.get(session.id));
    const titleChanged = Boolean(title && (title !== session.title || session.titleSource !== "cli"));
    if (!bindingChanged && !titleChanged) return false;
    const updated = { ...session,
      ...(bindingChanged && native ? { nativeSessionId: native.id, resumable: true } : {}),
      ...(titleChanged && title ? { title, titleSource: "cli" as const } : {}) };
    await this.repository.save(updated);
    Object.assign(session, updated);
    return true;
  }
  /** 只对保留了精确关联信息的 Codex/Antigravity 补绑，旧记录和其他 CLI 不做无效轮询。 */
  private needsNativeBinding(session: TaskSession) {
    return session.kind === "agent" && !session.archivedAt && !session.resumable
      && Boolean(session.nativeLaunchId && session.nativeHistoryRoot)
      && (session.agent?.agentId === "codex" || session.agent?.agentId === "antigravity");
  }
  /** 运行状态与未读仅检查活跃进程；未完成身份绑定独立检查，已有标题不参与后台轮询。 */
  private async refreshSessionSignals() {
    let changed = false;
    for (const session of this.sessions) {
      if (session.kind !== "agent" || session.archivedAt) continue;
      // 原生记录可能在进程停止后才落盘；补绑只开放恢复入口，不启动进程。
      const needsBinding = this.needsNativeBinding(session);
      if (needsBinding && await this.refreshNativeMetadata(session)) changed = true;
      if (session.status !== "running") continue;
      const previousReply = session.lastReplyAt;
      if (await this.refreshActivity(session)) changed = true;
      // 新回复到达且仍无标题时补读，不随之后的状态轮询重复读取已有名称。
      if (!needsBinding && !session.title && session.lastReplyAt !== previousReply
        && await this.refreshNativeMetadata(session)) changed = true;
    }
    if (changed) this.publish();
  }
  /** 只读原生结构化记录：相位仅在进程运行中保留；回复时间只前进，写库但不更新元数据时间。 */
  private async refreshActivity(session: TaskSession) {
    if (session.status !== "running") return false;
    const activity = await this.readActivity(session, this.titleEnvironments.get(session.id));
    if (!activity || session.status !== "running") return false;
    let changed = false;
    if (activity.phase !== session.phase || activity.waitingReason !== session.waitingReason) {
      session.phase = activity.phase; session.waitingReason = activity.waitingReason; changed = true;
    }
    if (this.applyUsage(session, activity.usage)) changed = true;
    if (this.advanceTurnTimes(session, activity.lastReplyAt, activity.lastPromptAt)) {
      await this.repository.save(session, { preserveUpdateTime: true });
      changed = true;
    }
    return changed;
  }
  /** 进入任务时补读已停止和归档会话。用量只留在内存；回复和提问时间只前进，写库但不更新元数据时间。 */
  private async refreshRecordedActivity(session: TaskSession) {
    if (session.kind !== "agent" || !session.nativeSessionId) return false;
    const activity = await this.readActivity(session, this.titleEnvironments.get(session.id));
    const usageChanged = this.applyUsage(session, activity?.usage);
    const timesChanged = this.advanceTurnTimes(session, activity?.lastReplyAt, activity?.lastPromptAt);
    if (timesChanged) await this.repository.save(session, { preserveUpdateTime: true });
    return usageChanged || timesChanged;
  }
  private applyUsage(session: TaskSession, usage: TaskSession["usage"]) {
    if (!usage) return false;
    if (JSON.stringify(session.usage) === JSON.stringify(usage)) return false;
    session.usage = usage;
    return true;
  }
  /** 已有时间不回退；没有新时间时保留原值。 */
  private laterTime(current: string | undefined, next?: string) {
    if (!next || (current && Date.parse(next) <= Date.parse(current))) return current;
    return next;
  }
  /** 回复和提问时间只前进；返回是否有任一时间被推进。 */
  private advanceTurnTimes(session: TaskSession, lastReplyAt?: string, lastPromptAt?: string) {
    const reply = this.laterTime(session.lastReplyAt, lastReplyAt);
    const prompt = this.laterTime(session.lastPromptAt, lastPromptAt);
    const changed = reply !== session.lastReplyAt || prompt !== session.lastPromptAt;
    if (reply) session.lastReplyAt = reply;
    if (prompt) session.lastPromptAt = prompt;
    return changed;
  }
  /** 结束前补读回复时间及尚未取得的原生身份/标题，避免在下一次状态检查前退出造成遗漏。 */
  private async captureFinalReply(session: TaskSession) {
    if (session.kind !== "agent") return;
    try {
      const activity = await this.readActivity(session, this.titleEnvironments.get(session.id));
      this.advanceTurnTimes(session, activity?.lastReplyAt, activity?.lastPromptAt);
      this.applyUsage(session, activity?.usage);
      if (!session.title || !session.resumable) await this.refreshNativeMetadata(session);
    }
    catch { /* 读取失败保留上次回复时间，不阻断停止流程。 */ }
  }
  private scheduleRuntimeRefresh() {
    if (this.closing || this.runtimeTimer || !this.sessions.some(session => this.needsNativeBinding(session)
      || (session.kind === "agent" && !session.archivedAt && session.status === "running"))) return;
    this.runtimeTimer = setTimeout(() => {
      this.runtimeTimer = null;
      void this.serialize(() => this.refreshSessionSignals()).catch(() => undefined).finally(() => this.scheduleRuntimeRefresh());
    }, RUNTIME_REFRESH_DELAY_MS);
    this.runtimeTimer.unref();
  }
  list() { return this.serialize(async () => { await this.initialize(); return this.sessions; }); }
  private publish() {
    for (const session of this.sessions) if (session.status !== "running") { delete session.phase; delete session.waitingReason; }
    // 启动失败、解除归档等状态变化也可能留下待绑定记录，不依赖某次成功启动来开启检查。
    this.scheduleRuntimeRefresh();
    this.changed(this.sessions); return this.sessions;
  }
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
    await this.workspaceMcp.release(session.id);
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
      if (input.sourceSessionId !== undefined && (typeof input.sourceSessionId !== "string" || !input.sourceSessionId || input.kind !== "agent" || input.resourceId !== undefined || input.commandId !== undefined || input.agent !== undefined || !input.agentId)) throw new Error("TASK_INVALID");
      const source = input.sourceSessionId === undefined ? undefined : await sessionFromSource(task, this.owned(input.sourceSessionId, owner));
      const workspace = source?.workspace ?? resolveSessionWorkspace(task.resources ?? [], input.resourceId);
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
        cwd: source?.cwd ?? "", workspace, agent: input.kind === "agent" ? agent : undefined, status: "starting", terminalId: "task-" + randomUUID(),
        ...((agent?.agentId === "codex" || agent?.agentId === "antigravity") && input.kind === "agent" ? { nativeLaunchId: randomUUID(), nativeLaunchAt: createdAt } : { nativeSessionId: randomUUID() }),
        resumable: false, createdAt, lastUpdateAt: createdAt, lastActiveAt: createdAt };
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
      if (resume ? !session.nativeSessionId : !session.nativeSessionId && !session.nativeLaunchId) throw new Error("SESSION_UNAVAILABLE");
      const launch = session.agent ? await prepareAgentLaunch(this.agents, session.agent, session.nativeSessionId ?? "", context.prompt, resume, session.nativeHistoryRoot,
        () => this.contextServer.connect(session.id, task.id), taskPrompt(task, false), async () => {
          const current = await this.loadTask(task.id);
          if (current.status === "ARCHIVED") throw new Error("SESSION_BUSY");
          return this.contextFiles.prepare(session.id, current, this.settings().tasksDirectory, await this.attachmentPaths(current));
        }, session.nativeLaunchId, () => this.attachWorkspace(session, task.id, context.cwd)) : undefined;
      if (launch) session.contextMode = launch.contextMode;
      delete session.contextSyncFailed;
      if (launch) this.titleEnvironments.set(session.id, { GROK_HOME: launch.env.GROK_HOME, CLAUDE_CONFIG_DIR: launch.env.CLAUDE_CONFIG_DIR });
      if (launch && session.agent?.agentId === "grok") session.nativeHistoryRoot = launch.env.GROK_HOME || path.join(os.homedir(), ".grok");
      if (launch && session.agent?.agentId === "claude") session.nativeHistoryRoot = launch.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
      if (launch && session.agent?.agentId === "codex") session.nativeHistoryRoot = launch.env.CODEX_HOME || path.join(os.homedir(), ".codex");
      if (launch && session.agent?.agentId === "antigravity") session.nativeHistoryRoot = path.join(os.homedir(), ".gemini", "antigravity-cli");
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
            if (this.closing || owner.isDestroyed()) return;
            await this.contextFiles.release(session.id);
            await this.workspaceMcp.release(session.id);
            if (!["running", "starting"].includes(session.status)) return;
            await this.captureFinalReply(session);
            session.status = "stopped";
            session.resumeOnOpen = false;
            await this.save(session);
          }).catch(() => undefined);
        },
        onExit: (code) => {
          finished?.(code);
          void this.serialize(async () => {
            if (!this.sessions.includes(session) || session.archivedAt || session.terminalId !== terminalId) return;
            if (this.closing || owner.isDestroyed()) return;
            await this.releaseContext(session);
            await this.captureFinalReply(session);
            session.status = code === 0 ? "stopped" : "failed";
            session.resumeOnOpen = false;
            if (session.command) session.commandExitCode = code;
            if (code !== 0) session.error = "SESSION_EXIT_FAILED";
            await this.save(session);
          }).catch(() => undefined);
        },
      });
      session.status = "running";
      session.resumeOnOpen = true;
      this.recordActivity(session, terminalId);
      session.resumable = Boolean(session.nativeSessionId && (resume || session.agent?.agentId === "claude" || session.agent?.agentId === "grok"));
      delete session.error;
      await this.save(session);
      // CLI 元数据可能尚未落盘，后续由详情进入、首次回复或 ID 绑定时补读。
      await this.refreshNativeMetadata(session);
      void writeDiagnosticEvent("session.start.succeeded", { taskId: task.id, operationId: session.id });
    } catch (error) {
      finished?.(null);
      await this.releaseContext(session);
      destroyTerminal({ sessionId: session.terminalId }, owner.id);
      session.status = "failed";
      session.resumeOnOpen = false;
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
      await this.captureFinalReply(session);
      session.status = "stopped";
      session.resumeOnOpen = false;
      await this.releaseContext(session);
      destroyTerminal({ sessionId: session.terminalId }, owner.id);
      void writeDiagnosticEvent("session.stop.succeeded", { taskId: session.taskId, operationId: session.id });
      if (session.kind === "shell") { this.sessions = this.sessions.filter((item) => item.id !== id); this.owners.delete(id); }
      else await this.repository.save(session);
      return this.publish();
    });
  }
  restart(id: string, resumeOnly: boolean, owner: WebContents, automatic = false) {
    return this.serialize(async () => {
      await this.initialize();
      const session = this.owned(id, owner);
      const task = await this.loadTask(session.taskId);
      if (automatic && (this.closing || !canAutoResumeSession(session, task))) return this.sessions;
      if (automatic) { session.resumeOnOpen = false;await this.repository.save(session); }
      if (this.closing || session.archivedAt || session.kind !== "agent" || (resumeOnly && ["starting", "running"].includes(session.status))) throw new Error("SESSION_BUSY");
      // 重启与恢复都必须连接原生对话；尚未识别时保留现场，绝不降级成新对话。
      if (!session.resumable || !session.nativeSessionId) throw new Error("SESSION_RESUME_UNSUPPORTED");
      // 重启在同一串行操作内先停止旧进程，旧 PTY 的延迟回调不能覆盖新实例。
      if (task.status === "ARCHIVED") throw new Error("SESSION_BUSY");
      if (task.initialization?.some((step) => step.status !== "succeeded")) throw new Error("SESSION_INITIALIZATION_REQUIRED");
      if (session.workspace?.kind === "resource" && !task.resources?.some((resource) => session.workspace?.kind === "resource" && resource.resourceId === session.workspace.resourceId)) throw new Error("SESSION_DIRECTORY_MISSING");
      if (this.sessions.filter((item) => item.id !== session.id && ["starting", "running"].includes(item.status)).length >= MAX_SESSIONS) throw new Error("SESSION_LIMIT");
      if (!resumeOnly) {
        session.status = "stopped";
        session.resumeOnOpen = false;
        await this.releaseContext(session);
        destroyTerminal({ sessionId: session.terminalId }, owner.id);
        await this.save(session);
      }
      session.terminalId = "task-" + randomUUID(); session.status = "starting";
      this.bindOwner(id, owner);
      await this.save(session);
      await this.launch(session, task, owner, true);
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
      session.resumeOnOpen = false;
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
      const restored = { ...session, status: "stopped" as const, resumeOnOpen: true, terminalId: "task-" + randomUUID() };
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
      session.resumeOnOpen = false;
      await this.releaseContext(session);
      destroyTerminal({ sessionId: session.terminalId }, owner.id);
      await this.repository.save(session);
      try {
        await this.nativeActions.rename(session, title, env);
        session.title = title.trim(); session.titleSource = "cli";
        await this.repository.save(session);
        await this.refreshNativeMetadata(session);
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
  /** 与会话启动共用队列；只归档任务，不将其会话逐条归档或删除。清理目录时同时关闭普通终端。 */
  archiveTask<Result>(taskId: string, closeTerminals: boolean, operation: () => Promise<Result>) {
    return this.serialize(async () => {
      await this.initialize();
      await this.loadTask(taskId);
      let failure: unknown;
      for (const session of this.sessions.filter((item) => item.taskId === taskId && (item.kind === "agent" || closeTerminals || item.initialization))) {
        if (session.kind === "agent" && (session.archivedAt || (!["starting", "running"].includes(session.status) && !session.resumeOnOpen))) continue;
        const terminalId = session.terminalId;
        session.status = "stopped";
        session.resumeOnOpen = false;
        // 已停止进程的延迟输出或退出回调不能覆盖归档后的状态。
        session.terminalId = "task-" + randomUUID();
        try {
          try { await this.releaseContext(session); }
          finally { destroyTerminal({ sessionId: terminalId }); }
          await this.repository.save(session);
        } catch (error) { failure ??= error; }
      }
      if (closeTerminals) this.sessions = this.sessions.filter((session) => session.taskId !== taskId || session.kind === "agent");
      try {
        if (failure) throw failure;
        return await operation();
      } finally { this.publish(); }
    });
  }

  deleteTask<Result>(taskId: string, operation: () => Promise<Result>) {
    return this.serialize(async () => {
      await this.initialize();
      for (const session of this.sessions.filter((item) => item.taskId === taskId)) {
        session.status = "stopped";
        session.resumeOnOpen = false;
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
    if (this.runtimeTimer) clearTimeout(this.runtimeTimer);
    this.runtimeTimer = null;
    if (this.activityTimer) clearTimeout(this.activityTimer);
    this.activityTimer = null;
    await this.serialize(() => this.flushActivity()).catch((error) => writeDiagnosticEvent("session.activity.failed", { error }));
    await this.queue;
    await this.workspaceMcp.close();
    await this.contextServer.close();
    await this.contextFiles.close();
  }
  private async attachWorkspace(session: TaskSession, taskId: string, cwd: string) {
    if (session.agent?.agentId !== "grok" && session.agent?.agentId !== "antigravity") return undefined;
    const connection = await this.contextServer.connect(session.id, taskId);
    try { return await this.workspaceMcp.attach({ agentId: session.agent.agentId, sessionId: session.id, cwd, connection }); }
    catch (error) { this.contextServer.revoke(session.id); throw error; }
  }
}
