import { create } from "zustand";
import type { StartTaskSessionInput, TaskSession } from "@/shared/taskSessionTypes";
import { getTaskSessionsApi } from "@/services/taskSessionApi";
import { destroyManagedTerminalSession, ensureManagedTerminalSession } from "@/components/terminal/terminalSessionManager";

type WorkspaceCommandRuns = ReadonlyMap<string, ReadonlyMap<string, number>>;

interface TaskSessionState {
  sessions: TaskSession[];
  /** 本次应用运行中，各任务工作区的命令执行时间，关闭终端后仍用于快捷入口。 */
  commandRuns: WorkspaceCommandRuns;
  loaded: boolean;
  pending: boolean;
  error: string | null;
  start: (input: StartTaskSessionInput) => Promise<void>;
  stop: (id: string) => Promise<void>;
  closeTerminal: (id: string, terminalId: string, mode: "inspect" | "confirm" | "force") => Promise<import("@/shared/taskSessionTypes").TaskTerminalCloseResult | undefined>;
  rerunCommand: (id: string, terminalId: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  restart: (id: string, resumeOnly: boolean) => Promise<void>;
  resumeVisible: (id: string) => Promise<boolean>;
  /** 传入任务 ID 时同步该任务的原生标题；省略时仅加载已保存的列表。 */
  refresh: (taskId?: string) => Promise<void>;
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.match(/(?:SESSION|AGENT)_[A-Z_]+/)?.[0] ?? "SESSION_START_FAILED";
}

export const useTaskSessionStore = create<TaskSessionState>((set, get) => {
  async function mutate(operation: () => Promise<TaskSession[]>) {
    if (get().pending) return;
    set({ pending: true, error: null });
    try { receiveSessions(await operation()); }
    catch (error) { set({ error: errorCode(error) }); }
    finally { set({ pending: false }); }
  }
  return {
    sessions: [], commandRuns: new Map(), loaded: false, pending: false, error: null,
    start: (input) => mutate(() => getTaskSessionsApi().start(input)),
    stop: (id) => mutate(() => getTaskSessionsApi().stop(id)),
    closeTerminal: async (id, terminalId, mode) => {
      if (get().pending) return;
      set({ pending: true, error: null });
      try {
        const result = await getTaskSessionsApi().closeTerminal(id, terminalId, mode);
        if (result.kind === "closed") receiveSessions(result.sessions);
        return result;
      } catch (error) { set({ error: errorCode(error) }); }
      finally { set({ pending: false }); }
    },
    rerunCommand: (id, terminalId) => mutate(() => getTaskSessionsApi().rerunCommand(id, terminalId)),
    archive: (id) => mutate(() => getTaskSessionsApi().archive(id)),
    restore: (id) => mutate(() => getTaskSessionsApi().restore(id)),
    rename: (id, title) => mutate(() => getTaskSessionsApi().rename(id, title)),
    remove: (id) => mutate(() => getTaskSessionsApi().remove(id)),
    restart: (id, resumeOnly) => mutate(() => getTaskSessionsApi().restart(id, resumeOnly)),
    resumeVisible: async (id) => {
      if (get().pending) return false;
      await mutate(() => getTaskSessionsApi().resumeVisible(id));
      return true;
    },
    refresh: async (taskId) => {
      const revision = eventRevision;
      try {
        const api = getTaskSessionsApi();
        const sessions = await (taskId ? api.refreshTitles(taskId) : api.list());
        if (revision === eventRevision) receiveSessions(sessions);
      }
      catch (error) { set({ error: errorCode(error) }); }
    },
  };
});

export function workspaceCommandKey(taskId: string, resourceId: string) {
  return JSON.stringify([taskId, resourceId]);
}

function rememberCommandRuns(previous: WorkspaceCommandRuns, sessions: TaskSession[]) {
  let updated: Map<string, ReadonlyMap<string, number>> | undefined;
  for (const { taskId, command, commandRunAt } of sessions) {
    if (!command || commandRunAt === undefined) continue;
    const key = workspaceCommandKey(taskId, command.resourceId);
    const runs = (updated ?? previous).get(key);
    if ((runs?.get(command.id) ?? -Infinity) >= commandRunAt) continue;
    updated ??= new Map(previous);
    updated.set(key, new Map(runs).set(command.id, commandRunAt));
  }
  return updated ?? previous;
}

let eventRevision = 0;
const attachedTerminals = new Set<string>();
function receiveSessions(sessions: TaskSession[]) {
  eventRevision += 1;
  const previous = useTaskSessionStore.getState();
  for (const session of previous.sessions) if (!session.archivedAt && !sessions.some((item) => item.terminalId === session.terminalId && !item.archivedAt)) {
    attachedTerminals.delete(session.terminalId);
    void destroyManagedTerminalSession(session.terminalId);
  }
  useTaskSessionStore.setState({ sessions, commandRuns: rememberCommandRuns(previous.commandRuns, sessions), loaded: true });
  for (const session of sessions) if (!session.archivedAt && (session.status === "running" || session.terminalExitCode !== undefined || session.commandExitCode !== undefined) && !attachedTerminals.has(session.terminalId)) {
    attachedTerminals.add(session.terminalId);
    ensureManagedTerminalSession(session.terminalId, session.cwd, 80, 24, undefined, true);
  }
}

/** 在应用层订阅，任务页/标签挂载与进程及输出缓冲相互独立。 */
export function subscribeTaskSessions() {
  try {
    const unsubscribe = getTaskSessionsApi().onChanged(receiveSessions);
    void useTaskSessionStore.getState().refresh();
    return unsubscribe;
  } catch { return () => undefined; }
}
