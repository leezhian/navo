import { useCallback, useEffect, useRef, useState } from "react";
import type { GitCommitStatus } from "@/shared/electronApi";
import {
  loadGitCommitStatus,
  onProjectChanged,
  unwatchProject,
  watchProject,
} from "@/services/reviewApi";
import { areCommitStatusesEqual, preserveCommitDiffStats } from "./gitCommitStatusUtils";
import { pathsMatch } from "./reviewCompareMode";

/** 连续保存文件时，提交状态不需要按每一个文件系统事件执行 Git 命令。 */
const STATUS_EVENT_DEBOUNCE_MS = 300;
/** 等待一小段时间让外部 Git 的连续元数据写入完成，再执行排队的最后一次查询。 */
const STATUS_QUEUED_REFRESH_DELAY_MS = 100;

interface UseGitCommitStatusOptions {
  /** 提交弹窗打开时读取增删统计；关闭时仅加载按钮组所需的基础状态。 */
  includeDiffStats?: boolean;
}

interface RefreshOptions {
  /** 查询进行中时是否追加一次刷新；仅复用当前结果的调用可关闭。 */
  queueIfInFlight?: boolean;
}

/**
 * 提交面板的 Git 状态：进入审查页加载一次，项目变化、窗口重新聚焦或页面重新可见时刷新，
 * 提交/推送动作完成后由调用方手动 refresh。
 *
 * 提交面板不能依赖 diff 页的实时监听：分支/上一轮对话等模式可能没有挂载 diff watcher，
 * 但用户仍然需要看到其他 Git 客户端带来的最新提交状态。
 */
export function useGitCommitStatus(
  projectPath: string,
  { includeDiffStats = false }: UseGitCommitStatusOptions = {},
) {
  const [status, setStatus] = useState<GitCommitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef<GitCommitStatus | null>(null);
  const includeDiffStatsRef = useRef(includeDiffStats);
  const previousIncludeDiffStatsRef = useRef(includeDiffStats);
  const requestSequenceRef = useRef(0);
  const refreshInFlightRef = useRef<Promise<GitCommitStatus | null> | null>(null);
  const refreshInFlightIncludesDiffStatsRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const lastRefreshIncludedDiffStatsRef = useRef(false);
  const eventRefreshTimerRef = useRef<number | null>(null);
  const activeProjectPathRef = useRef<string | null>(null);
  includeDiffStatsRef.current = includeDiffStats;

  const refresh = useCallback(
    ({ queueIfInFlight = true }: RefreshOptions = {}): Promise<GitCommitStatus | null> => {
      // 立即刷新优先于尚未执行的事件刷新，避免同一批文件变化触发两次查询。
      if (eventRefreshTimerRef.current !== null) {
        window.clearTimeout(eventRefreshTimerRef.current);
        eventRefreshTimerRef.current = null;
      }

      // Git 状态由多个命令组成；查询尚未结束时只记一次待刷新，禁止并发启动更多 Git 进程。
      if (refreshInFlightRef.current) {
        const needsDiffStatsUpgrade =
          includeDiffStatsRef.current && !refreshInFlightIncludesDiffStatsRef.current;

        if (queueIfInFlight || needsDiffStatsUpgrade) {
          refreshQueuedRef.current = true;
        }

        return refreshInFlightRef.current;
      }

      const requestSequence = requestSequenceRef.current + 1;
      requestSequenceRef.current = requestSequence;
      const requestIncludesDiffStats = includeDiffStatsRef.current;

      const request = loadGitCommitStatus(projectPath, { includeDiffStats: requestIncludesDiffStats })
        .then((loadedStatus) => {
          // 项目切换时旧请求仍可能返回；只允许当前请求更新界面。
          if (requestSequence !== requestSequenceRef.current) {
            return null;
          }

          lastRefreshIncludedDiffStatsRef.current = requestIncludesDiffStats;
          // 基础状态请求不包含 shortstat，保留上一次统计可避免关闭弹窗后产生一次无意义重渲染。
          const nextStatus = requestIncludesDiffStats
            ? loadedStatus
            : preserveCommitDiffStats(loadedStatus, statusRef.current);

          if (!areCommitStatusesEqual(statusRef.current, nextStatus)) {
            statusRef.current = nextStatus;
            setStatus(nextStatus);
          }

          setError(null);
          return nextStatus;
        })
        .catch((statusError) => {
          if (requestSequence !== requestSequenceRef.current) {
            return null;
          }

          // 失去 Git 状态时清空旧值，避免按钮继续基于过期状态执行操作。
          lastRefreshIncludedDiffStatsRef.current = false;
          statusRef.current = null;
          setStatus(null);
          setError(statusError instanceof Error ? statusError.message : String(statusError));
          return null;
        });

      refreshInFlightRef.current = request;
      refreshInFlightIncludesDiffStatsRef.current = requestIncludesDiffStats;

      const finishRefresh = () => {
        if (refreshInFlightRef.current !== request) {
          return;
        }

        refreshInFlightRef.current = null;
        refreshInFlightIncludesDiffStatsRef.current = false;

        if (!refreshQueuedRef.current || activeProjectPathRef.current !== projectPath) {
          refreshQueuedRef.current = false;
          return;
        }

        refreshQueuedRef.current = false;
        eventRefreshTimerRef.current = window.setTimeout(() => {
          eventRefreshTimerRef.current = null;

          if (activeProjectPathRef.current === projectPath) {
            void refresh();
          }
        }, STATUS_QUEUED_REFRESH_DELAY_MS);
      };

      void request.then(finishRefresh, finishRefresh);
      return request;
    },
    [projectPath],
  );

  const scheduleRefresh = useCallback(() => {
    if (eventRefreshTimerRef.current !== null) {
      window.clearTimeout(eventRefreshTimerRef.current);
    }

    eventRefreshTimerRef.current = window.setTimeout(() => {
      eventRefreshTimerRef.current = null;
      void refresh();
    }, STATUS_EVENT_DEBOUNCE_MS);
  }, [refresh]);

  const refreshWithDiffStats = useCallback(async () => {
    // 打开弹窗的显式请求可直接升级当前查询级别，不必等待 React 状态回写到下一次 render。
    includeDiffStatsRef.current = true;
    let latestStatus = await refresh({ queueIfInFlight: false });

    if (latestStatus !== null && !lastRefreshIncludedDiffStatsRef.current) {
      latestStatus = await refresh({ queueIfInFlight: false });
    }

    return latestStatus;
  }, [refresh]);

  useEffect(() => {
    const becameEnabled = includeDiffStats && !previousIncludeDiffStatsRef.current;
    previousIncludeDiffStatsRef.current = includeDiffStats;

    if (becameEnabled) {
      void refresh({ queueIfInFlight: false });
    }
  }, [includeDiffStats, refresh]);

  useEffect(() => {
    let cancelled = false;
    let watchStarted = false;
    const watchedProjectPath = projectPath;
    activeProjectPathRef.current = watchedProjectPath;

    statusRef.current = null;
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
        scheduleRefresh();
      }
    });

    // 外部 Git 客户端可能在应用失焦期间完成操作，重新回到应用时合并核对一次真实状态。
    const handleFocus = () => {
      scheduleRefresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleRefresh();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      requestSequenceRef.current += 1;
      activeProjectPathRef.current = null;
      statusRef.current = null;
      refreshQueuedRef.current = false;
      refreshInFlightRef.current = null;
      refreshInFlightIncludesDiffStatsRef.current = false;
      lastRefreshIncludedDiffStatsRef.current = false;

      if (eventRefreshTimerRef.current !== null) {
        window.clearTimeout(eventRefreshTimerRef.current);
        eventRefreshTimerRef.current = null;
      }

      unsubscribeProjectChanged();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (watchStarted) {
        void unwatchProject(watchedProjectPath).catch(() => undefined);
      }
    };
  }, [projectPath, refresh, scheduleRefresh]);

  return { status, refresh, refreshWithDiffStats, error };
}
