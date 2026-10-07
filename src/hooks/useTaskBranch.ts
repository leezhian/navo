import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskResource } from "@/shared/taskTypes";
import type { TaskBranchSnapshot } from "@/shared/taskBranchTypes";
import { getTasksApi } from "@/services/taskApi";
import { onProjectChanged, unwatchProject, watchProject } from "@/services/reviewApi";

/** 可见分支栏订阅目录变化，合并连续刷新；跨仓库的迟到结果不能覆盖当前列表。 */
export function useTaskBranch(taskId: string, resource: TaskResource) {
  const [snapshot, setSnapshot] = useState<TaskBranchSnapshot | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const refreshRef = useRef<() => void>(() => undefined);
  const refresh = useCallback(() => refreshRef.current(), []);
  const { resourceId, workingPath, sourceBranch } = resource;
  useEffect(() => {
    let disposed = false, pending = false, queued = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setSnapshot(null); setError(false); setLoading(true);
    async function load() {
      if (disposed) return;
      if (pending) { queued = true; return; }
      pending = true;
      try {
        const next = await getTasksApi().loadBranch(taskId, resourceId);
        if (!disposed) { setSnapshot(next); setError(false); }
      } catch { if (!disposed) setError(true); }
      finally {
        pending = false;
        if (!disposed) { setLoading(false); if (queued) { queued = false; void load(); } }
      }
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(() => void load(), 250); }
    refreshRef.current = () => void load();
    void load();
    const watch = watchProject(workingPath).then(() => true, () => false);
    const unsubscribe = onProjectChanged((changed) => { if (changed.replace(/\/+$/, "") === workingPath.replace(/\/+$/, "")) schedule(); });
    window.addEventListener("focus", schedule);
    const poll = setInterval(schedule, 10000);
    return () => {
      disposed = true; clearTimeout(timer); clearInterval(poll); unsubscribe(); window.removeEventListener("focus", schedule);
      void watch.then((owned) => { if (owned) return unwatchProject(workingPath); }).catch(() => undefined);
    };
  }, [taskId, resourceId, workingPath, sourceBranch]);
  return { snapshot, loading, error, refresh };
}
