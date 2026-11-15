import { useEffect, useState } from "react";
import type { TaskResource } from "@/shared/taskTypes";
import type { ChangeGitStatus } from "@/shared/changeGitStatus";
import { getCachedChangeGitStatus, loadChangeGitStatus } from "@/services/changeGitStatusCache";

interface UseChangeGitStatusResult {
  /** 已有快照，包含过期但仍可展示的上次结果。 */
  status: ChangeGitStatus | null;
  loading: boolean;
}

/** 仅在悬停打开时读取；30 秒内使用缓存，失败保留上次结果。 */
export function useChangeGitStatus(taskId: string, resource: TaskResource, enabled: boolean): UseChangeGitStatusResult {
  const { resourceId, workingPath } = resource;
  const [status, setStatus] = useState<ChangeGitStatus | null>(() => getCachedChangeGitStatus(taskId, resourceId, workingPath, true));
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const fresh = getCachedChangeGitStatus(taskId, resourceId, workingPath);
    if (fresh) {
      setStatus(fresh);
      setLoading(false);
      return;
    }
    const previous = getCachedChangeGitStatus(taskId, resourceId, workingPath, true);
    if (previous) {
      setStatus(previous);
    } else {
      setStatus(null);
      setLoading(true);
    }
    let cancelled = false;
    void loadChangeGitStatus(taskId, resourceId, workingPath, true).then((next) => {
      if (!cancelled) { setStatus(next); setLoading(false); }
    }).catch(() => {
      if (cancelled) return;
      const fallback = getCachedChangeGitStatus(taskId, resourceId, workingPath, true);
      setStatus(fallback ?? {
        branchName: resource.targetBranch || resource.sourceBranch,
        repoName: resource.name,
        workingPath: resource.workingPath,
        isDetached: false,
        missingDirectory: false,
        failed: true,
        operation: null,
        sinceSource: null,
        uncommitted: { files: 0, additions: 0, deletions: 0 },
        untrackedCount: 0,
        upstream: null,
        sourceBehind: null,
        isMainWorktree: false,
      });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [enabled, taskId, resourceId, workingPath, resource.targetBranch, resource.sourceBranch, resource.name]);
  return { status, loading };
}
