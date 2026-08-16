import type { GhosttyWorkerMessage } from "./ghosttyVtTypes";

interface GhosttyVtClientListener {
  (html: string): void;
}

interface GhosttyVtClientErrorListener {
  (message: string): void;
}

interface GhosttyReadyWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
}

interface GhosttySessionState {
  latestHtml: string;
  listeners: Set<GhosttyVtClientListener>;
  errorListeners: Set<GhosttyVtClientErrorListener>;
  isReady: boolean;
  pendingWrites: string[];
  readyWaiters: Set<GhosttyReadyWaiter>;
}

/**
 * 进程内共享一个 Ghostty Worker。
 * Tab 切换只取消当前组件订阅，终端状态继续留在 Worker 中；关闭 Tab 时才发送 destroy。
 */
class GhosttyVtClient {
  private readonly worker = new Worker(new URL("./ghosttyVt.worker.ts", import.meta.url), { type: "module" });
  private readonly sessions = new Map<string, GhosttySessionState>();

  constructor() {
    this.worker.onmessage = (event: MessageEvent<GhosttyWorkerMessage>) => {
      this.handleMessage(event.data);
    };
  }

  create(sessionId: string, cols: number, rows: number): Promise<void> {
    const state = this.ensureState(sessionId);
    rejectReadyWaiters(state, new Error("Ghostty 终端正在重新创建"));
    state.isReady = false;
    state.latestHtml = "";
    state.pendingWrites = [];
    this.worker.postMessage({ type: "create", sessionId, cols, rows });

    return new Promise((resolve, reject) => {
      state.readyWaiters.add({ resolve, reject });
    });
  }

  write(sessionId: string, data: string): void {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return;
    }

    if (!state.isReady) {
      state.pendingWrites.push(data);
      return;
    }

    this.worker.postMessage({ type: "write", sessionId, data });
  }

  resize(sessionId: string, cols: number, rows: number): void {
    if (!this.sessions.has(sessionId)) {
      return;
    }

    this.worker.postMessage({ type: "resize", sessionId, cols, rows });
  }

  destroy(sessionId: string): void {
    this.worker.postMessage({ type: "destroy", sessionId });
    const state = this.sessions.get(sessionId);
    if (state) {
      rejectReadyWaiters(state, new Error("Ghostty 终端已关闭"));
    }
    this.sessions.delete(sessionId);
  }

  subscribe(sessionId: string, listener: GhosttyVtClientListener): () => void {
    const state = this.ensureState(sessionId);
    state.listeners.add(listener);
    if (state.latestHtml) {
      listener(state.latestHtml);
    }

    return () => state.listeners.delete(listener);
  }

  subscribeErrors(sessionId: string, listener: GhosttyVtClientErrorListener): () => void {
    const state = this.ensureState(sessionId);
    state.errorListeners.add(listener);
    return () => state.errorListeners.delete(listener);
  }

  private ensureState(sessionId: string): GhosttySessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const state: GhosttySessionState = {
      latestHtml: "",
      listeners: new Set(),
      errorListeners: new Set(),
      isReady: false,
      pendingWrites: [],
      readyWaiters: new Set(),
    };
    this.sessions.set(sessionId, state);
    return state;
  }

  private handleMessage(message: GhosttyWorkerMessage): void {
    const state = this.sessions.get(message.sessionId);
    // 关闭 Tab 后 Worker 可能还有已排队消息；忽略它们，不能重新创建客户端状态。
    if (!state) {
      return;
    }

    if (message.type === "ready") {
      state.isReady = true;
      for (const data of state.pendingWrites) {
        this.worker.postMessage({ type: "write", sessionId: message.sessionId, data });
      }
      state.pendingWrites = [];
      for (const waiter of state.readyWaiters) {
        waiter.resolve();
      }
      state.readyWaiters.clear();
      return;
    }

    if (message.type !== "frame") {
      if (message.type === "error") {
        console.error(`[libghostty-vt] ${message.sessionId}: ${message.message}`);
        rejectReadyWaiters(state, new Error(message.message));
        for (const listener of state.errorListeners) {
          listener(message.message);
        }
      }
      return;
    }

    state.latestHtml = message.html;
    for (const listener of state.listeners) {
      listener(message.html);
    }
  }
}

function rejectReadyWaiters(state: GhosttySessionState, error: Error): void {
  for (const waiter of state.readyWaiters) {
    waiter.reject(error);
  }
  state.readyWaiters.clear();
}

export const ghosttyVtClient = new GhosttyVtClient();
