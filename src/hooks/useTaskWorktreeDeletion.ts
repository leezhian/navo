import { useEffect, useState } from "react";
import type { TaskWorktreeDeletionPreview } from "@/shared/taskDeletionTypes";
import { getTasksApi } from "@/services/taskApi";
import { useTaskStore } from "@/stores/taskStore";

/** 物理删除前预检查；失败后丢弃一次性凭据，重新检查后才能再次确认。 */
export function useTaskWorktreeDeletion(taskId: string, resourceId: string, onDeleted: () => void) {
  const [preview, setPreview] = useState<TaskWorktreeDeletionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const pending = useTaskStore((state) => state.pending);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => getTasksApi().inspectWorktreeDeletion(taskId, resourceId)).then((value) => { if (!cancelled) setPreview(value); })
      .catch((failure) => { if (!cancelled) setError(failure); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId, resourceId, revision]);
  function refresh() { setPreview(null); setLoading(true); setRevision((value) => value + 1); }
  async function confirm() {
    if (!preview || loading || pending || preview.blocked) return;
    setError(null);
    try { await useTaskStore.getState().deleteWorktree(taskId, resourceId, { token: preview.token }); onDeleted(); }
    catch (failure) { setError(failure); refresh(); }
  }
  return { preview, loading, pending, error, refresh, confirm };
}
