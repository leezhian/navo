import type { TraceQuery, TraceResult } from "../../../src/shared/extensionTypes";

interface Pending {
  resolve: (value: TraceResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pending = new Map<number, Pending>();
let nextId = 0;
export interface Appearance {
  locale: string;
  dark: boolean;
  tokens: Record<string, string>;
}
const appearances = new Set<(value: Appearance) => void>(),
  changes = new Set<() => void>();
window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const message = event.data;
  if (message?.type === "appearance") for (const listener of appearances) listener(message);
  if (message?.type === "refresh") for (const listener of changes) listener();
  if (message?.type === "result") {
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    clearTimeout(item.timer);
    if (message.error) item.reject(Error(message.error));
    else item.resolve(message.result);
  }
});
export const bridge = {
  query(query: TraceQuery): Promise<TraceResult> {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error("RUNTIME_TIMEOUT"));
      }, 125000);
      pending.set(id, { resolve, reject, timer });
      window.parent.postMessage({ type: "query", id, query }, "*");
    });
  },
  subscribe(appearance: (value: Appearance) => void, change: () => void) {
    appearances.add(appearance);
    changes.add(change);
    window.parent.postMessage({ type: "ready" }, "*");
    return () => {
      appearances.delete(appearance);
      changes.delete(change);
    };
  },
};
