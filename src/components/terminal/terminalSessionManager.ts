import { createTerminal, destroyTerminal, onTerminalData, onTerminalExit, resizeTerminal, writeTerminal } from "@/services/terminalApi";
import { GhosttyTerminalSurface } from "./ghosttyTerminalSurface";

export type TerminalSessionStatus = "starting" | "ready" | "exited" | "error";
interface ManagedTerminalSession {
  /** 附着视图不拥有任务进程，渲染失败不能终止 Agent。 */
  attachOnly: boolean;
  cols: number;
  rows: number;
  status: TerminalSessionStatus;
  hasOutput: boolean;
  surface?: GhosttyTerminalSurface;
  /** 首次附着丢弃回放前的实时广播，避免把相同输出解析两次。 */
  awaitingReplay: boolean;
  pendingOutput: string[];
  view?: { owner: object; container: HTMLElement };
  destroyed: boolean;
}
const sessions = new Map<string, ManagedTerminalSession>();
const listeners = new Map<string, Set<() => void>>();
let unsubscribeEvents: (() => void) | undefined;
export function hasManagedTerminalSession(id: string) { return sessions.has(id); }
export function getManagedTerminalStatus(id: string): TerminalSessionStatus { return sessions.get(id)?.status ?? "starting"; }
export function getManagedTerminalSnapshot(id: string) {
  const session = sessions.get(id);
  return { status: session?.status ?? "starting" as TerminalSessionStatus, hasOutput: session?.hasOutput ?? false };
}
export function subscribeManagedTerminalSession(id: string, listener: () => void) {
  const group = listeners.get(id) ?? new Set<() => void>();
  group.add(listener); listeners.set(id, group); listener();
  return () => { group.delete(listener); if (!group.size) listeners.delete(id); };
}
function notify(id: string) { listeners.get(id)?.forEach((listener) => listener()); }

export function ensureManagedTerminalSession(id: string, cwd: string | undefined, cols: number, rows: number, operationToken?: string, attachOnly = false): void {
  // 页面挂载与 Store 订阅可以同时到达，只有首次调用创建/附着 PTY。
  if (sessions.has(id)) return;
  ensureEventRouter();
  const session: ManagedTerminalSession = { attachOnly, cols, rows, status: "starting", hasOutput: false,
    awaitingReplay: attachOnly, pendingOutput: [], destroyed: false };
  sessions.set(id, session); notify(id);
  void start();
  async function start() {
    try {
      const surface = await GhosttyTerminalSurface.create(cols, rows, (data) => {
        if (!session.destroyed && (session.status === "ready" || session.status === "starting")) void writeManagedTerminalSession(id, data).catch(() => undefined);
      }, (cols, rows) => {
        if (session.cols === cols && session.rows === rows) return;
        session.cols = cols; session.rows = rows;
        if (session.status === "ready") sendSize(id, session);
      });
      if (session.destroyed) { surface.dispose(); return; }
      session.surface = surface;
      notify(id);
      await createTerminal({ sessionId: id, cwd, cols: session.cols, rows: session.rows, operationToken, attachOnly });
      if (session.destroyed || session.status === "error") return;
      // 快速命令可能先发来退出事件，不能再将状态覆盖为 ready。
      if (session.status === "starting") session.status = "ready";
      surface.setReadOnly(session.status !== "ready");
      for (const data of session.pendingOutput.splice(0)) surface.write(data);
      if (session.status === "ready") sendSize(id, session);
      notify(id);
    } catch { fail(id, session); }
  }
}

export function mountManagedTerminalSession(id: string, owner: object, container: HTMLElement, label: string) {
  const session = sessions.get(id);
  if (!session?.surface || session.destroyed || session.status === "error" || !isVisible(container)) return false;
  if (session.view && session.view.owner !== owner && isVisible(session.view.container)) return false;
  if (session.surface.element.parentElement !== container) container.appendChild(session.surface.element);
  session.view = { owner, container };
  session.surface.setLabel(label);
  session.surface.fit();
  return true;
}
export function unmountManagedTerminalSession(id: string, owner: object) {
  const session = sessions.get(id);
  if (session?.view?.owner !== owner) return;
  session.surface?.element.remove(); session.view = undefined;
}
export function focusManagedTerminalSession(id: string, owner: object) {
  const session = sessions.get(id);
  if (session?.view?.owner === owner && isVisible(session.view.container)) session.surface?.focus();
}
function isVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return element.isConnected && rect.width > 0 && rect.height > 0;
}

export function writeManagedTerminalSession(id: string, data: string): Promise<void> {
  const session = sessions.get(id);
  if (!session || session.destroyed || session.status === "exited" || session.status === "error") return Promise.reject(new Error("终端会话不可写入"));
  return writeTerminal({ sessionId: id, data }).catch((error: unknown) => { fail(id, session); throw error; });
}
export async function destroyManagedTerminalSession(id: string): Promise<void> {
  const session = sessions.get(id);
  if (session) { session.destroyed = true; session.surface?.dispose(); session.pendingOutput = []; sessions.delete(id); }
  await destroyTerminal({ sessionId: id }).catch(() => undefined);
  if (!sessions.size) { unsubscribeEvents?.(); unsubscribeEvents = undefined; }
}
function sendSize(id: string, session: ManagedTerminalSession) {
  void resizeTerminal({ sessionId: id, cols: session.cols, rows: session.rows }).catch(() => {
    if (session.status !== "exited") fail(id, session);
  });
}
function ensureEventRouter() {
  if (unsubscribeEvents) return;
  const offData = onTerminalData((payload) => {
    const session = sessions.get(payload.sessionId);
    if (!session || session.destroyed || session.status === "error") return;
    if (session.awaitingReplay) {
      if (!payload.replay) return;
      session.awaitingReplay = false;
    } else if (payload.replay) return;
    if (!payload.data) return;
    try {
      if (session.surface) session.surface.write(payload.data);
      else session.pendingOutput.push(payload.data);
      if (!session.hasOutput) { session.hasOutput = true; notify(payload.sessionId); }
    } catch { fail(payload.sessionId, session); }
  });
  const offExit = onTerminalExit(({ sessionId }) => {
    const session = sessions.get(sessionId);
    if (!session || session.destroyed || session.status === "error") return;
    session.status = "exited"; session.surface?.setReadOnly(true); notify(sessionId);
  });
  unsubscribeEvents = () => { offData(); offExit(); };
}
function fail(id: string, session: ManagedTerminalSession) {
  if (session.destroyed || session.status === "error") return;
  session.status = "error"; session.pendingOutput = []; session.surface?.dispose(); session.surface = undefined;
  notify(id);
  if (!session.attachOnly) void destroyTerminal({ sessionId: id }).catch(() => undefined);
}
