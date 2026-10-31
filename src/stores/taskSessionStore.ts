import { create } from "zustand";
import type { StartTaskSessionInput, TaskSession } from "@/shared/taskSessionTypes";
import { getTaskSessionsApi } from "@/services/taskSessionApi";
import { destroyManagedTerminalSession, ensureManagedTerminalSession } from "@/components/terminal/terminalSessionManager";

interface TaskSessionState {
  sessions: TaskSession[];
  loaded: boolean;
  pending: boolean;
  error: string | null;
  start: (input: StartTaskSessionInput) => Promise<void>;
  stop: (id: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  restart: (id: string, resume: boolean) => Promise<void>;
  resumeVisible: (id: string) => Promise<boolean>;
  refresh: () => Promise<void>;
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
    sessions: [], loaded: false, pending: false, error: null,
    start: (input) => mutate(() => getTaskSessionsApi().start(input)),
    stop: (id) => mutate(() => getTaskSessionsApi().stop(id)),
    archive: (id) => mutate(() => getTaskSessionsApi().archive(id)),
    restore: (id) => mutate(() => getTaskSessionsApi().restore(id)),
    rename: (id, title) => mutate(() => getTaskSessionsApi().rename(id, title)),
    remove: (id) => mutate(() => getTaskSessionsApi().remove(id)),
    restart: (id, resume) => mutate(() => getTaskSessionsApi().restart(id, resume)),
    resumeVisible: async (id) => {
      if (get().pending) return false;
      await mutate(() => getTaskSessionsApi().resumeVisible(id));
      return true;
    },
    refresh: async () => {
      const revision = eventRevision;
      try { const sessions = await getTaskSessionsApi().list(); if (revision === eventRevision) receiveSessions(sessions); }
      catch (error) { set({ error: errorCode(error) }); }
    },
  };
});

let eventRevision = 0;
const attachedTerminals = new Set<string>();
function receiveSessions(sessions: TaskSession[]) {
  eventRevision += 1;
  const previous = useTaskSessionStore.getState().sessions;
  for (const session of previous) if (!session.archivedAt && !sessions.some((item) => item.terminalId === session.terminalId && !item.archivedAt)) {
    attachedTerminals.delete(session.terminalId);
    void destroyManagedTerminalSession(session.terminalId);
  }
  useTaskSessionStore.setState({ sessions, loaded: true });
  for (const session of sessions) if (!session.archivedAt && (session.status === "running" || session.commandExitCode !== undefined) && !attachedTerminals.has(session.terminalId)) {
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
