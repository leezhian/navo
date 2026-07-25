import { useEffect, useRef } from "react";
import type { CompareMode, ReviewSession } from "@/domain/types";
import {
  loadReviewDiffSignature,
  onProjectChanged,
  unwatchProject,
  watchProject,
} from "@/services/reviewApi";
import { isLiveCompareMode, pathsMatch } from "./reviewCompareMode";

interface UseLiveProjectDiffSyncParams {
  /** 当前会话 id；为空时不监听。 */
  sessionId: string | null;
  /** 当前项目路径；为空时不监听。 */
  projectPath: string | null;
  /** 当前对比方式；仅 live 模式启用监听。 */
  compareMode: CompareMode;
  /** 读取最新会话（避免 effect 闭包过期）。 */
  getSession: () => ReviewSession | null;
  /** 读取最新对比方式。 */
  getCompareMode: () => CompareMode;
  /** 读取最新目标分支。 */
  getTargetBranch: () => string;
  /** 读取当前已应用的 diff 签名；null 表示硬加载尚未完成。 */
  getLastSignature: () => string | null;
  /** 签名变化后触发软刷新。 */
  onSoftRefresh: (session: ReviewSession, mode: CompareMode, branch: string) => void;
  /** 签名变化后可顺带刷新 untracked 等附属提示。 */
  onAfterSignatureChanged?: (session: ReviewSession, mode: CompareMode) => void;
}

/**
 * 实时对比模式下监听工作区 / Git 元数据变化。
 * 签名未变则完全 no-op；变了才回调软刷新。
 * Codex 等 Agent 后台改文件时窗口常 hidden，仍必须检查，故不只依赖 visibility。
 */
export function useLiveProjectDiffSync({
  sessionId,
  projectPath,
  compareMode,
  getSession,
  getCompareMode,
  getTargetBranch,
  getLastSignature,
  onSoftRefresh,
  onAfterSignatureChanged,
}: UseLiveProjectDiffSyncParams) {
  const getSessionRef = useRef(getSession);
  const getCompareModeRef = useRef(getCompareMode);
  const getTargetBranchRef = useRef(getTargetBranch);
  const getLastSignatureRef = useRef(getLastSignature);
  const onSoftRefreshRef = useRef(onSoftRefresh);
  const onAfterSignatureChangedRef = useRef(onAfterSignatureChanged);

  getSessionRef.current = getSession;
  getCompareModeRef.current = getCompareMode;
  getTargetBranchRef.current = getTargetBranch;
  getLastSignatureRef.current = getLastSignature;
  onSoftRefreshRef.current = onSoftRefresh;
  onAfterSignatureChangedRef.current = onAfterSignatureChanged;

  useEffect(() => {
    if (!sessionId || !projectPath || !isLiveCompareMode(compareMode)) {
      return;
    }

    const watchedProjectPath = projectPath;
    const watchedSessionId = sessionId;
    let cancelled = false;
    let checkInFlight = false;
    /** 检查进行中又来了新事件时排队，避免连写多文件时只查到半截结果。 */
    let checkQueued = false;

    void watchProject(watchedProjectPath).catch(() => undefined);

    const checkForLiveDiffChanges = async () => {
      if (cancelled) {
        return;
      }

      if (checkInFlight) {
        checkQueued = true;
        return;
      }

      const session = getSessionRef.current();
      const mode = getCompareModeRef.current();
      const branch = getTargetBranchRef.current();

      if (!session || session.id !== watchedSessionId || !isLiveCompareMode(mode)) {
        return;
      }

      if (!pathsMatch(session.projectPath, watchedProjectPath)) {
        return;
      }

      checkInFlight = true;

      try {
        const signature = await loadReviewDiffSignature({
          session,
          mode,
          targetBranch: branch,
        });

        if (cancelled) {
          return;
        }

        if (
          getCompareModeRef.current() !== mode ||
          getSessionRef.current()?.id !== session.id ||
          !isLiveCompareMode(getCompareModeRef.current())
        ) {
          return;
        }

        const lastSignature = getLastSignatureRef.current();

        // 签名未变：零副作用。
        if (lastSignature != null && signature === lastSignature) {
          return;
        }

        // 首次尚无签名时等硬加载完成，避免与首屏全量加载抢跑。
        if (lastSignature == null) {
          return;
        }

        onAfterSignatureChangedRef.current?.(session, mode);
        onSoftRefreshRef.current(session, mode, branch);
      } catch {
        // 自动检查失败不打断当前视图。
      } finally {
        checkInFlight = false;

        if (checkQueued && !cancelled) {
          checkQueued = false;
          void checkForLiveDiffChanges();
        }
      }
    };

    const unsubscribeProjectChanged = onProjectChanged((changedProjectPath) => {
      if (!pathsMatch(changedProjectPath, watchedProjectPath)) {
        return;
      }

      void checkForLiveDiffChanges();
    });

    const handleFocus = () => {
      void checkForLiveDiffChanges();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkForLiveDiffChanges();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      unsubscribeProjectChanged();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void unwatchProject(watchedProjectPath).catch(() => undefined);
    };
  }, [compareMode, projectPath, sessionId]);
}
