import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Task } from "@/domain/tasks";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { canAutoResumeSession } from "@/utils/taskSessionResume";
import { useTaskSessionStore } from "@/stores/taskSessionStore";

/** 每个任务页实例仅尝试一次；隐藏标签、折叠面板及后台窗口不启动 CLI。 */
export function useVisibleSessionResume(task: Task, session: TaskSession | undefined, visible: boolean, root: RefObject<HTMLDivElement | null>) {
  const attempted = useRef(new Set<string>());
  const [onScreen, setOnScreen] = useState(false);
  const [foreground, setForeground] = useState(document.visibilityState === "visible");
  const pending = useTaskSessionStore((state) => state.pending);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0));
    observer.observe(element);
    const changed = () => setForeground(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", changed);
    return () => { observer.disconnect();document.removeEventListener("visibilitychange", changed); };
  }, [root]);
  useEffect(() => {
    if (!visible || !onScreen || !foreground || pending || !session || !canAutoResumeSession(session, task) || attempted.current.has(session.id)) return;
    // 切换标签后的同一帧，IntersectionObserver 可能仍是旧值，提交前核对实际布局。
    const bounds = root.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0 || document.visibilityState !== "visible") return;
    attempted.current.add(session.id);
    void useTaskSessionStore.getState().resumeVisible(session.id).then((started) => {
      if (!started) attempted.current.delete(session.id);
    });
  }, [task, session, visible, onScreen, foreground, pending, root]);
}
