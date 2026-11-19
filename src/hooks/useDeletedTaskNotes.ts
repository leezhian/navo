import { useEffect, useState } from "react";
import type { TaskNote } from "@/shared/taskResourceTypes";
import { getTasksApi } from "@/services/taskApi";
import { useTaskStore } from "@/stores/taskStore";

/** 回收内容按需读取，不放入任务活动资源或 Agent 上下文。 */
export function useDeletedTaskNotes(taskId: string, contextVersion: number | undefined) {
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    void getTasksApi().deletedNotes(taskId).then((items) => {
      if (!cancelled) setNotes(items);
    }).catch((failure) => { if (!cancelled) setError(failure); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId, contextVersion, revision]);

  async function restore(note: TaskNote, version?: number) {
    setError(null);
    try {
      await useTaskStore.getState().restoreDeletedNote(taskId, note.id, note.version, version);
      setNotes((items) => items.filter((item) => item.id !== note.id));
      return true;
    } catch (failure) { setError(failure); return false; }
  }
  return { notes, loading, error, restore, reload: () => setRevision((value) => value + 1) };
}
