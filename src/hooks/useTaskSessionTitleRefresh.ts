import { useEffect, type RefObject } from "react";
import { useTaskSessionStore } from "@/stores/taskSessionStore";

/** 详情首次显示或从隐藏标签切回时检查标题；尺寸变化、会话状态更新不重复触发。 */
export function useTaskSessionTitleRefresh(taskId: string, root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let wasVisible = false;
    const observer = new IntersectionObserver(([entry]) => {
      const visible = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0;
      if (visible && !wasVisible) void useTaskSessionStore.getState().refresh(taskId);
      wasVisible = visible;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [taskId, root]);
}
