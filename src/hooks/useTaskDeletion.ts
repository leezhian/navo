import { useEffect, useState } from "react";
import { getTasksApi } from "@/services/taskApi";
import { useTaskStore } from "@/stores/taskStore";
import type { TaskDeletionOptions, TaskDeletionPreview } from "@/shared/taskDeletionTypes";

/** 每次挂载重新选择清理范围；取消或切换选项时丢弃旧预检查结果。 */
export function useTaskDeletion(taskId: string, onDeleted: () => void) {
  const [options, setOptions] = useState<TaskDeletionOptions>({ deleteWorktrees: false, deleteBranches: false });
  const [preview, setPreview] = useState<TaskDeletionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const pending = useTaskStore((state) => state.pending);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.resolve().then(() => getTasksApi().inspectDeletion(taskId, options)).then((value) => {
      if (!cancelled) setPreview(value);
    }).catch((failure) => { if (!cancelled) setError(failure); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId, options, revision]);

  function refresh() {
    setPreview(null); setLoading(true);
    setRevision((current) => current + 1);
  }
  function changeOptions(next: TaskDeletionOptions) {
    setPreview(null); setLoading(true); setError(null); setOptions(next);
  }
  async function confirm() {
    if (!preview || loading || pending || preview.blocked) return;
    setError(null);
    const success = await useTaskStore.getState().remove(taskId, { token: preview.token });
    if (success) onDeleted();
    else {
      setError(useTaskStore.getState().error);
      refresh();
    }
  }
  return { options, preview, loading, pending, error, refresh, changeOptions, confirm };
}
