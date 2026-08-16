import { useCallback, useEffect, useState } from "react";
import type { GitCommitStatus } from "@/shared/electronApi";
import { loadGitCommitStatus, onProjectChanged } from "@/services/reviewApi";

/**
 * 提交面板的 Git 状态：进入审查页加载一次，项目文件变化时自动刷新，
 * 提交/推送动作完成后由调用方手动 refresh。
 */
export function useGitCommitStatus(projectPath: string) {
  const [status, setStatus] = useState<GitCommitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    loadGitCommitStatus(projectPath)
      .then((nextStatus) => {
        setStatus(nextStatus);
        setError(null);
      })
      .catch((statusError) => {
        // 失去 Git 状态时清空旧值，避免按钮继续基于过期状态执行操作。
        setStatus(null);
        setError(statusError instanceof Error ? statusError.message : String(statusError));
      });
  }, [projectPath]);

  useEffect(() => {
    setStatus(null);
    setError(null);
    refresh();

    // 复用审查区已有的项目变化推送（useReviewData 已对当前项目 watchProject）。
    return onProjectChanged((changedProjectPath) => {
      if (changedProjectPath === projectPath) {
        refresh();
      }
    });
  }, [projectPath, refresh]);

  return { status, refresh, error };
}
