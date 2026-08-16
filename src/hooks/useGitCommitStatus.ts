import { useCallback, useEffect, useRef, useState } from "react";
import type { GitCommitStatus } from "@/shared/electronApi";
import {
  loadGitCommitStatus,
  onProjectChanged,
  unwatchProject,
  watchProject,
} from "@/services/reviewApi";
import { pathsMatch } from "./reviewCompareMode";

/**
 * 提交面板的 Git 状态：进入审查页加载一次，项目变化、窗口重新聚焦或页面重新可见时刷新，
 * 提交/推送动作完成后由调用方手动 refresh。
 *
 * 提交面板不能依赖 diff 页的实时监听：分支/上一轮对话等模式可能没有挂载 diff watcher，
 * 但用户仍然需要看到其他 Git 客户端带来的最新提交状态。
 */
export function useGitCommitStatus(projectPath: string) {
  const [status, setStatus] = useState<GitCommitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);

  const refresh = useCallback(async (): Promise<GitCommitStatus | null> => {
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;

    try {
      const nextStatus = await loadGitCommitStatus(projectPath);

      // Git 命令可能并发执行；只允许最后一次请求更新界面，避免旧快照覆盖新快照。
      if (requestSequence !== requestSequenceRef.current) {
        return null;
      }

      setStatus(nextStatus);
      setError(null);
      return nextStatus;
    } catch (statusError) {
      if (requestSequence !== requestSequenceRef.current) {
        return null;
      }

      // 失去 Git 状态时清空旧值，避免按钮继续基于过期状态执行操作。
      setStatus(null);
      setError(statusError instanceof Error ? statusError.message : String(statusError));
      return null;
    }
  }, [projectPath]);

  useEffect(() => {
    let cancelled = false;
    let watchStarted = false;
    const watchedProjectPath = projectPath;

    setStatus(null);
    setError(null);
    requestSequenceRef.current += 1;
    void refresh();

    // 提交状态自身持有 watcher，避免只在特定 diff 模式下才能感知外部 Git 操作。
    void watchProject(watchedProjectPath)
      .then(() => {
        if (cancelled) {
          void unwatchProject(watchedProjectPath).catch(() => undefined);
          return;
        }

        watchStarted = true;
      })
      .catch(() => undefined);

    const unsubscribeProjectChanged = onProjectChanged((changedProjectPath) => {
      if (pathsMatch(changedProjectPath, watchedProjectPath)) {
        void refresh();
      }
    });

    // 外部 Git 客户端可能在应用失焦期间完成操作，重新回到应用时主动核对一次真实状态。
    const handleFocus = () => {
      void refresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      requestSequenceRef.current += 1;
      unsubscribeProjectChanged();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (watchStarted) {
        void unwatchProject(watchedProjectPath).catch(() => undefined);
      }
    };
  }, [projectPath, refresh]);

  return { status, refresh, error };
}
