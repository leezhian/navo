import {
  createTerminal,
  destroyTerminal,
  onTerminalData,
  onTerminalExit,
  resizeTerminal,
  writeTerminal,
} from "@/services/terminalApi";
import { ghosttyVtClient } from "./ghostty-vt/ghosttyVtClient";

export type TerminalSessionStatus = "starting" | "ready" | "exited" | "error";

interface ManagedTerminalSession {
  cols: number;
  rows: number;
  status: TerminalSessionStatus;
  isDestroyed: boolean;
  unsubscribeGhosttyError: () => void;
}

type TerminalStatusListener = (status: TerminalSessionStatus) => void;

const managedSessions = new Map<string, ManagedTerminalSession>();
const statusListeners = new Map<string, Set<TerminalStatusListener>>();
let unsubscribeTerminalEvents: (() => void) | null = null;

export function getManagedTerminalStatus(sessionId: string): TerminalSessionStatus {
  return managedSessions.get(sessionId)?.status ?? "starting";
}

export function subscribeManagedTerminalStatus(
  sessionId: string,
  listener: TerminalStatusListener,
): () => void {
  const listeners = statusListeners.get(sessionId) ?? new Set<TerminalStatusListener>();
  listeners.add(listener);
  statusListeners.set(sessionId, listeners);
  listener(getManagedTerminalStatus(sessionId));

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      statusListeners.delete(sessionId);
    }
  };
}

export function ensureManagedTerminalSession(
  sessionId: string,
  cwd: string | undefined,
  cols: number,
  rows: number,
  operationToken?: string,
): void {
  const existing = managedSessions.get(sessionId);
  if (existing) {
    resizeManagedTerminalSession(sessionId, cols, rows);
    return;
  }

  ensureTerminalEventRouter();
  const session: ManagedTerminalSession = {
    cols,
    rows,
    status: "starting",
    isDestroyed: false,
    unsubscribeGhosttyError: () => undefined,
  };
  managedSessions.set(sessionId, session);
  notifyStatus(sessionId, session.status);

  session.unsubscribeGhosttyError = ghosttyVtClient.subscribeErrors(sessionId, () => {
    failManagedTerminalSession(sessionId, session);
  });

  const initialCols = cols;
  const initialRows = rows;
  const ghosttyReady = ghosttyVtClient.create(sessionId, cols, rows);
  const ptyReady = createTerminal({ sessionId, cwd, cols, rows, operationToken });

  void Promise.all([ghosttyReady, ptyReady])
    .then(() => {
      if (session.isDestroyed || session.status !== "starting") {
        return;
      }

      session.status = "ready";
      notifyStatus(sessionId, session.status);
      if (session.cols !== initialCols || session.rows !== initialRows) {
        resizeRunningTerminal(sessionId, session);
      }
    })
    .catch(() => {
      failManagedTerminalSession(sessionId, session);
    });
}

export function writeManagedTerminalSession(sessionId: string, data: string): Promise<void> {
  const session = managedSessions.get(sessionId);
  if (!session || session.isDestroyed || session.status === "exited" || session.status === "error") {
    return Promise.reject(new Error("终端会话不可写入"));
  }

  return writeTerminal({ sessionId, data }).catch((error: unknown) => {
    failManagedTerminalSession(sessionId, session);
    throw error;
  });
}

export async function destroyManagedTerminalSession(sessionId: string): Promise<void> {
  const session = managedSessions.get(sessionId);
  if (session) {
    session.isDestroyed = true;
    session.unsubscribeGhosttyError();
    managedSessions.delete(sessionId);
  }

  ghosttyVtClient.destroy(sessionId);
  await destroyTerminal({ sessionId }).catch(() => undefined);
  stopTerminalEventRouterIfIdle();
}

function resizeManagedTerminalSession(sessionId: string, cols: number, rows: number): void {
  const session = managedSessions.get(sessionId);
  if (!session || session.isDestroyed || (session.cols === cols && session.rows === rows)) {
    return;
  }

  session.cols = cols;
  session.rows = rows;
  if (session.status === "ready") {
    resizeRunningTerminal(sessionId, session);
  }
}

function resizeRunningTerminal(sessionId: string, session: ManagedTerminalSession): void {
  ghosttyVtClient.resize(sessionId, session.cols, session.rows);
  void resizeTerminal({ sessionId, cols: session.cols, rows: session.rows }).catch(() => {
    failManagedTerminalSession(sessionId, session);
  });
}

function ensureTerminalEventRouter(): void {
  if (unsubscribeTerminalEvents) {
    return;
  }

  const unsubscribeData = onTerminalData((payload) => {
    const session = managedSessions.get(payload.sessionId);
    if (session && !session.isDestroyed && session.status !== "error") {
      // 即使对应 Tab 当前未挂载，也持续喂给 Ghostty，切回时才能恢复最新屏幕。
      ghosttyVtClient.write(payload.sessionId, payload.data);
    }
  });
  const unsubscribeExit = onTerminalExit((payload) => {
    const session = managedSessions.get(payload.sessionId);
    if (!session || session.isDestroyed || session.status === "error") {
      return;
    }

    session.status = "exited";
    notifyStatus(payload.sessionId, session.status);
  });

  unsubscribeTerminalEvents = () => {
    unsubscribeData();
    unsubscribeExit();
  };
}

function stopTerminalEventRouterIfIdle(): void {
  if (managedSessions.size > 0 || !unsubscribeTerminalEvents) {
    return;
  }

  unsubscribeTerminalEvents();
  unsubscribeTerminalEvents = null;
}

function failManagedTerminalSession(sessionId: string, session: ManagedTerminalSession): void {
  if (session.isDestroyed || session.status === "error") {
    return;
  }

  session.status = "error";
  session.unsubscribeGhosttyError();
  ghosttyVtClient.destroy(sessionId);
  notifyStatus(sessionId, session.status);
  void destroyTerminal({ sessionId }).catch(() => undefined);
}

function notifyStatus(sessionId: string, status: TerminalSessionStatus): void {
  for (const listener of statusListeners.get(sessionId) ?? []) {
    listener(status);
  }
}
