import { useEffect, useRef, useState } from "react";

const REFRESH_COOLDOWN_MS = 60_000;

/** 页面内存中的刷新冷却；切换视图不重置，退出应用后不保留。 */
export function useRefreshCooldown(onRefresh: () => void | Promise<void>, disabled: boolean) {
  const gate = useRef({ refreshing: false, availableAt: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [failed, setFailed] = useState(false);
  const coolingDown = remainingSeconds > 0;

  useEffect(() => {
    if (!coolingDown) return;
    const update = () => setRemainingSeconds(Math.max(0, Math.ceil((gate.current.availableAt - Date.now()) / 1000)));
    const timer = window.setInterval(update, 1000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [coolingDown]);

  async function refresh() {
    if (disabled || gate.current.refreshing || Date.now() < gate.current.availableAt) return;
    gate.current.refreshing = true;
    setRefreshing(true);
    setFailed(false);
    try {
      await onRefresh();
    } catch {
      setFailed(true);
    } finally {
      gate.current.availableAt = Date.now() + REFRESH_COOLDOWN_MS;
      gate.current.refreshing = false;
      setRemainingSeconds(REFRESH_COOLDOWN_MS / 1000);
      setRefreshing(false);
    }
  }

  return { refresh, refreshing, remainingSeconds, failed, disabled: disabled || refreshing || coolingDown };
}
