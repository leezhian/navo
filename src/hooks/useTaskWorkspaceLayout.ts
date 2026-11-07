import { useCallback, useEffect, useRef, useState } from "react";
import {
  defaultTaskWorkspaceLayout,
  readTaskWorkspaceLayout,
  writeTaskWorkspaceLayout,
  type TaskWorkspaceLayout,
} from "@/utils/taskWorkspaceLayout";

/**
 * 按任务恢复并记忆工作台列宽与面板显隐。进程生命周期不依赖此状态。
 * 首次进入无记录时由调用方结合窄屏规则给出默认值。
 */
export function useTaskWorkspaceLayout(taskId: string) {
  const saved = useRef(readTaskWorkspaceLayout(taskId));
  const [layout, setLayout] = useState<TaskWorkspaceLayout>(() => saved.current ?? defaultTaskWorkspaceLayout());
  const hasSaved = saved.current !== null;
  const layoutRef = useRef(layout);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const next = readTaskWorkspaceLayout(taskId);
    saved.current = next;
    const resolved = next ?? defaultTaskWorkspaceLayout();
    layoutRef.current = resolved;
    setLayout(resolved);
    return () => {
      // 换任务或卸载时立刻落盘，避免 debounce 未到就丢掉最后一次尺寸。
      clearTimeout(timer.current);
      timer.current = undefined;
      writeTaskWorkspaceLayout(taskId, layoutRef.current);
    };
  }, [taskId]);

  const persist = useCallback((next: TaskWorkspaceLayout) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      writeTaskWorkspaceLayout(taskId, next);
    }, 120);
  }, [taskId]);

  const update = useCallback((patch: Partial<TaskWorkspaceLayout> | ((current: TaskWorkspaceLayout) => TaskWorkspaceLayout)) => {
    setLayout((current) => {
      const next = typeof patch === "function" ? patch(current) : { ...current, ...patch };
      layoutRef.current = next;
      persist(next);
      return next;
    });
  }, [persist]);

  return { layout, update, hasSaved };
}
