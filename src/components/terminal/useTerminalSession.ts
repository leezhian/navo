import { useEffect, useRef, useState } from "react";
import { ensureManagedTerminalSession, focusManagedTerminalSession, getManagedTerminalSnapshot, mountManagedTerminalSession,
  subscribeManagedTerminalSession, unmountManagedTerminalSession } from "./terminalSessionManager";

interface UseTerminalSessionParams {
  /** 首次启动设置页 CLI 操作时消费，重新挂载不重复执行。 */
  operationToken?: string;
  /** 任务服务持有进程，组件只附着。 */
  attachOnly?: boolean;
  sessionId: string;
  cwd?: string;
  /** 命令终端展开时不抢走应用当前焦点。 */
  autoFocus: boolean;
  /** 提供给终端输入区域和 textarea 的本地化名称。 */
  label: string;
}

export function useTerminalSession({ sessionId, cwd, operationToken, attachOnly, autoFocus, label }: UseTerminalSessionParams) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState(() => getManagedTerminalSnapshot(sessionId));
  const labelRef = useRef(label);
  labelRef.current = label;
  useEffect(() => {
    const element = terminalRef.current;
    if (!element) return;
    const owner = {};
    let focused = !autoFocus;
    let disposed = false;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    function sync() {
      if (disposed || !element) return;
      if (!element.clientWidth || !element.clientHeight) { unmountManagedTerminalSession(sessionId, owner); return; }
      ensureManagedTerminalSession(sessionId, cwd, 80, 24, operationToken, attachOnly);
      if (mountManagedTerminalSession(sessionId, owner, element, labelRef.current) && !focused) {
        // 异步 WASM 加载结束时，仅前台可见页面可以按原入口意图获取焦点。
        if (document.visibilityState !== "hidden") { focusManagedTerminalSession(sessionId, owner); focused = true; }
      }
    }
    const unsubscribe = subscribeManagedTerminalSession(sessionId, () => { setSnapshot(getManagedTerminalSnapshot(sessionId)); sync(); });
    const resize = new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(sync, 32); });
    resize.observe(element);
    const visibility = new IntersectionObserver(() => sync());
    visibility.observe(element);
    window.addEventListener("resize", sync);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      disposed = true; clearTimeout(resizeTimer); resize.disconnect(); visibility.disconnect(); unsubscribe();
      window.removeEventListener("resize", sync); document.removeEventListener("visibilitychange", sync);
      unmountManagedTerminalSession(sessionId, owner);
    };
  }, [sessionId, cwd, operationToken, attachOnly, autoFocus]);
  useEffect(() => {
    terminalRef.current?.querySelectorAll('[role="textbox"], textarea').forEach((element) => element.setAttribute("aria-label", label));
  }, [label]);
  return { terminalRef, ...snapshot };
}
