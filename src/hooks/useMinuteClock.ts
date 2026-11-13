import { useSyncExternalStore } from "react";

let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
const getSnapshot = () => now;

function update() {
  now = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    update();
    timer = setInterval(update, 60_000);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", update);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", update);
    }
  };
}

/** 所有任务共用分钟时钟；没有日期组件挂载时停止计时。 */
export function useMinuteClock() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
