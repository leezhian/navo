import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { getTaskError } from "@/services/taskErrors";
import { getTasksApi } from "@/services/taskApi";
import { useTaskStore } from "@/stores/taskStore";
import { useTaskResourceUndoStore } from "@/stores/taskResourceUndoStore";
import { TASK_RESOURCE_UNDO_WINDOW_MS } from "@/shared/taskResourceLifecycle";

interface TaskResourceUndoBarProps {
  /** 只展示当前任务的短撤销，切换任务后隐藏。 */
  taskId: string;
}

const EMPTY_SKIPPED: import("@/shared/taskResourceLifecycle").TaskResourceSkip[] = [];

export function TaskResourceUndoBar({ taskId }: TaskResourceUndoBarProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const expiresAt = useTaskResourceUndoStore((state) => state.taskId === taskId ? state.expiresAt : null);
  const skipped = useTaskResourceUndoStore((state) => state.taskId === taskId ? state.skipped : EMPTY_SKIPPED);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const pending = useTaskStore((state) => state.pending);

  useEffect(() => {
    if (!expiresAt) { setRemaining(0); setError(null); return; }
    const tick = () => {
      const ms = Math.max(0, Date.parse(expiresAt) - Date.now());
      setRemaining(ms);
      if (ms <= 0) useTaskResourceUndoStore.getState().clear();
    };
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  if (!expiresAt || remaining <= 0) return null;
  const progress = remaining / TASK_RESOURCE_UNDO_WINDOW_MS;

  async function undo() {
    if (pending) return;
    setError(null);
    try {
      await useTaskStore.getState().undoResourceChange(taskId);
      useTaskResourceUndoStore.getState().clear();
    } catch (failure) { setError(failure); }
  }

  return <div data-undo-bar className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5 text-xs" role="status">
    <span data-undo-ring className="relative size-4 shrink-0" aria-hidden="true">
      <svg viewBox="0 0 16 16" className="size-4 -rotate-90">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={`${progress * 37.7} 37.7`} />
      </svg>
    </span>
    <span className="text-muted-foreground">{t("tasks:resources.undoLabel")}</span>
    {skipped.length > 0 && <span className="text-muted-foreground">{t("tasks:resources.skipped.summary", { count: skipped.length })}
      {skipped.slice(0, 3).map((item) => t(`tasks:resources.skipped.${item.reason}`)).join(" · ")}
    </span>}
    {error !== null && <span role="alert" className="text-destructive">{getTaskError(error)}</span>}
    <Button type="button" variant="outline" size="sm" className="ml-auto h-6 px-2" data-undo-button disabled={pending} onClick={() => void undo()}>{t("tasks:resources.undo")}</Button>
  </div>;
}

export function dismissTaskResourceUndo(taskId: string) {
  useTaskResourceUndoStore.getState().clear();
  try { void getTasksApi().dismissResourceUndo(taskId); } catch { /* demo 或测试夹具可能没有该方法。 */ }
}

export function useDismissResourceUndo(taskId: string) {
  useEffect(() => () => { dismissTaskResourceUndo(taskId); }, [taskId]);
}
