import { useCallback, useEffect, useState } from "react";
import type { GitCommitStatus } from "@/shared/electronApi";
import { loadGitCommitStatus, onProjectChanged } from "@/services/reviewApi";

/**
 * 提交面板的 Git 状态：进入审查页加载一次，项目文件变化时自动刷新，
 * 提交/推送动作完成后由调用方手动 refresh。
 */
export function useGitCommitStatus(projectPath: string) {
  const [status, setStatus] = useState<GitCommitStatus | null>(null);

  const refresh = useCallback(() => {
    loadGitCommitStatus(projectPath)
      .then(setStatus)
      .catch(() => undefined);
  }, [projectPath]);

  useEffect(() => {
    setStatus(null);
    refresh();

    // 复用审查区已有的项目变化推送（useReviewData 已对当前项目 watchProject）。
    return onProjectChanged((changedProjectPath) => {
      if (changedProjectPath === projectPath) {
        refresh();
      }
    });
  }, [projectPath, refresh]);

  return { status, refresh };
}
