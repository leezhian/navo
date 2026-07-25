import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CompareMode,
  CompareModeFileCounts,
  DiffFile,
  ReviewBatchFileAction,
  ReviewFileAction,
  ReviewSession,
  ReviewSummary,
} from "@/domain/types";
import {
  loadLocalBranches,
  loadReviewDiff,
  loadUntrackedFileCount,
  runReviewBatchFileAction,
  runReviewFileAction,
} from "@/services/reviewApi";
import { readStoredCompareMode, writeStoredCompareMode } from "./compareModeStorage";
import {
  getDiffViewCacheKey,
  readDiffViewSnapshot,
  writeDiffViewSnapshot,
} from "./diffViewSessionCache";
import {
  getHardReloadKey,
  getReviewScopeKey,
  isLiveCompareMode,
  isTrackedFileCountMode,
} from "./reviewCompareMode";
import {
  createFileIdSet,
  getInitialCollapsedFileIds,
  mergeSoftRefreshSummary,
  resolveCollapsedFileIds,
  resolveSelectedFileId,
} from "./reviewDataState";
import { useLiveProjectDiffSync } from "./useLiveProjectDiffSync";

interface UseReviewDataParams {
  /** 当前选中的审查会话；为空时停止加载 diff，并清空对比方式文件数。 */
  selectedSession: ReviewSession | null;
  /** 分支对比模式使用的目标分支名称。 */
  targetBranch: string;
}

export function useReviewData({ selectedSession, targetBranch }: UseReviewDataParams) {
  // 从 sessionStorage / 内存恢复，避免 HMR 重挂载后弹回默认「上一轮」。
  const [compareMode, setCompareModeState] = useState<CompareMode>(readStoredCompareMode);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [collapsedFileIds, setCollapsedFileIds] = useState<Set<string>>(new Set());
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  /** summary 所属对比方式；仅当与 compareMode 一致时对外展示。 */
  const [summaryCompareMode, setSummaryCompareMode] = useState<CompareMode | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [localBranches, setLocalBranches] = useState<string[]>(["main", "master"]);
  const [compareModeFileCounts, setCompareModeFileCounts] = useState<CompareModeFileCounts>({});
  const [untrackedFileCount, setUntrackedFileCount] = useState(0);

  const reviewScopeKeyRef = useRef<string | null>(null);
  const reviewFileIdsRef = useRef<Set<string>>(new Set());
  const lastDiffSignatureRef = useRef<string | null>(null);
  const reviewSummaryRef = useRef<ReviewSummary | null>(null);
  const summaryCompareModeRef = useRef<CompareMode | null>(null);

  /**
   * 硬加载纪元：仅 hard 递增。soft 完成时若纪元已变则丢弃。
   * soft 不会抬升纪元，因此不会作废进行中的 hard。
   */
  const hardEpochRef = useRef(0);
  /** 软加载序号：同纪元内后发 soft 覆盖先发 soft。 */
  const softSeqRef = useRef(0);
  const untrackedSeqRef = useRef(0);

  const compareModeRef = useRef(compareMode);
  const selectedSessionRef = useRef(selectedSession);
  const targetBranchRef = useRef(targetBranch);
  compareModeRef.current = compareMode;
  selectedSessionRef.current = selectedSession;
  targetBranchRef.current = targetBranch;

  const setCompareMode = useCallback((mode: CompareMode) => {
    writeStoredCompareMode(mode);
    setCompareModeState(mode);
  }, []);

  const clearReviewState = useCallback(() => {
    // 绝不重置 compareMode。
    hardEpochRef.current += 1;
    softSeqRef.current += 1;
    setCompareModeFileCounts({});
    setReviewSummary(null);
    reviewSummaryRef.current = null;
    setSummaryCompareMode(null);
    summaryCompareModeRef.current = null;
    setReviewError(null);
    setSelectedFileId(null);
    setCollapsedFileIds(new Set());
    setUntrackedFileCount(0);
    reviewScopeKeyRef.current = null;
    reviewFileIdsRef.current = new Set();
    lastDiffSignatureRef.current = null;
  }, []);

  const refreshUntrackedHint = useCallback((projectPath: string | null, mode: CompareMode) => {
    if (!projectPath || !isLiveCompareMode(mode)) {
      setUntrackedFileCount((current) => (current === 0 ? current : 0));
      return;
    }

    const seq = untrackedSeqRef.current + 1;
    untrackedSeqRef.current = seq;

    loadUntrackedFileCount(projectPath)
      .then((count) => {
        if (seq !== untrackedSeqRef.current) {
          return;
        }

        setUntrackedFileCount((current) => (current === count ? current : count));
      })
      .catch(() => {
        if (seq !== untrackedSeqRef.current) {
          return;
        }

        setUntrackedFileCount((current) => (current === 0 ? current : 0));
      });
  }, []);

  const applyReviewSummary = useCallback(
    (params: {
      summary: ReviewSummary;
      signature: string;
      mode: CompareMode;
      scopeKey: string;
      soft: boolean;
      sessionId: string;
      targetBranch: string;
    }) => {
      const { summary, signature, mode, scopeKey, soft, sessionId, targetBranch: branch } = params;

      if (compareModeRef.current !== mode) {
        return;
      }

      // 签名未变且已有同模式数据：跳过 setState。
      if (
        signature === lastDiffSignatureRef.current &&
        summaryCompareModeRef.current === mode &&
        reviewSummaryRef.current != null
      ) {
        return;
      }

      const previousScopeKey = reviewScopeKeyRef.current;
      const previousFileIds = previousScopeKey === scopeKey ? reviewFileIdsRef.current : new Set<string>();
      // soft 永不清空：复用未改动文件引用，减少 CodeView 重建。
      const nextSummary = soft ? mergeSoftRefreshSummary(reviewSummaryRef.current, summary) : summary;

      if (soft && nextSummary === reviewSummaryRef.current && summaryCompareModeRef.current === mode) {
        lastDiffSignatureRef.current = signature;
        writeDiffViewSnapshot(getDiffViewCacheKey(sessionId, mode, branch), {
          summary: nextSummary,
          mode,
          signature,
        });
        return;
      }

      if (isTrackedFileCountMode(mode)) {
        setCompareModeFileCounts((counts) => {
          if (counts[mode] === nextSummary.fileCount) {
            return counts;
          }

          return { ...counts, [mode]: nextSummary.fileCount };
        });
      }

      reviewSummaryRef.current = nextSummary;
      summaryCompareModeRef.current = mode;
      setReviewSummary(nextSummary);
      setSummaryCompareMode(mode);
      setSelectedFileId((selected) => resolveSelectedFileId(nextSummary.files, selected));
      setCollapsedFileIds((collapsed) =>
        previousScopeKey === scopeKey
          ? resolveCollapsedFileIds(nextSummary.files, collapsed, previousFileIds)
          : getInitialCollapsedFileIds(nextSummary.files),
      );
      reviewScopeKeyRef.current = scopeKey;
      reviewFileIdsRef.current = createFileIdSet(nextSummary.files);
      lastDiffSignatureRef.current = signature;
      writeDiffViewSnapshot(getDiffViewCacheKey(sessionId, mode, branch), {
        summary: nextSummary,
        mode,
        signature,
      });
    },
    [],
  );

  const loadReviewFor = useCallback(
    (session: ReviewSession, mode: CompareMode, branch: string, options?: { soft?: boolean }) => {
      const soft = options?.soft === true;
      const scopeKey = getReviewScopeKey(session, mode, branch);

      // soft 不抬升 hard 纪元；hard 抬升纪元并作废 in-flight soft。
      const hardEpochAtStart = hardEpochRef.current;
      let softSeq = softSeqRef.current;
      let hardEpoch = hardEpochRef.current;

      if (soft) {
        softSeq += 1;
        softSeqRef.current = softSeq;
      } else {
        hardEpoch += 1;
        hardEpochRef.current = hardEpoch;
        softSeqRef.current += 1;
      }

      // soft 不打断视图：不清 error、不先清空 summary。
      if (!soft) {
        setReviewError(null);
        loadCompareModeFileCounts(session, branch)
          .then((counts) => {
            if (hardEpochRef.current !== hardEpoch) {
              return;
            }

            setCompareModeFileCounts(counts);
          })
          .catch(() => {
            if (hardEpochRef.current !== hardEpoch) {
              return;
            }

            setCompareModeFileCounts({});
          });
        refreshUntrackedHint(session.projectPath, mode);
      }

      const isStale = () => {
        if (compareModeRef.current !== mode || selectedSessionRef.current?.id !== session.id) {
          return true;
        }

        if (soft) {
          return softSeqRef.current !== softSeq || hardEpochRef.current !== hardEpochAtStart;
        }

        return hardEpochRef.current !== hardEpoch;
      };

      loadReviewDiff({ session, mode, targetBranch: branch })
        .then(({ summary, signature }) => {
          if (isStale()) {
            return;
          }

          applyReviewSummary({
            summary,
            signature,
            mode,
            scopeKey,
            soft,
            sessionId: session.id,
            targetBranch: branch,
          });
        })
        .catch((error: unknown) => {
          if (soft || isStale()) {
            // 软刷新失败保持旧 diff。
            return;
          }

          setReviewError(error instanceof Error ? error.message : String(error));
        });
    },
    [applyReviewSummary, refreshUntrackedHint],
  );

  const loadReviewForRef = useRef(loadReviewFor);
  loadReviewForRef.current = loadReviewFor;

  const refreshReview = useCallback(() => {
    const session = selectedSessionRef.current;
    if (!session) {
      clearReviewState();
      return;
    }

    loadReviewForRef.current(session, compareModeRef.current, targetBranchRef.current, { soft: false });
  }, [clearReviewState]);

  const selectedSessionId = selectedSession?.id ?? null;
  const selectedSessionProjectPath = selectedSession?.projectPath ?? null;
  const hardReloadKey = getHardReloadKey(selectedSession, compareMode, targetBranch);

  // HMR / 重挂载：仅在同 mode 尚无数据时用模块缓存填回，避免先白屏。
  useEffect(() => {
    if (!selectedSessionId) {
      return;
    }

    const cacheKey = getDiffViewCacheKey(selectedSessionId, compareMode, targetBranch);
    const cached = readDiffViewSnapshot(cacheKey);
    if (!cached || cached.mode !== compareMode) {
      return;
    }

    if (reviewSummaryRef.current != null && summaryCompareModeRef.current === compareMode) {
      return;
    }

    reviewSummaryRef.current = cached.summary;
    summaryCompareModeRef.current = cached.mode;
    lastDiffSignatureRef.current = cached.signature || null;
    reviewFileIdsRef.current = createFileIdSet(cached.summary.files);
    reviewScopeKeyRef.current = `${selectedSessionId}:${compareMode}:${targetBranch}`;
    setReviewSummary(cached.summary);
    setSummaryCompareMode(cached.mode);
    setSelectedFileId((selected) => resolveSelectedFileId(cached.summary.files, selected));
  }, [compareMode, selectedSessionId, targetBranch]);

  // 单一硬刷新入口：依赖键变化时全量加载（live / previous-session 共用）。
  useEffect(() => {
    if (!hardReloadKey) {
      clearReviewState();
      return;
    }

    const session = selectedSessionRef.current;
    if (!session) {
      clearReviewState();
      return;
    }

    loadReviewForRef.current(session, compareModeRef.current, targetBranchRef.current, { soft: false });
  }, [clearReviewState, hardReloadKey]);

  useLiveProjectDiffSync({
    sessionId: selectedSessionId,
    projectPath: selectedSessionProjectPath,
    compareMode,
    getSession: () => selectedSessionRef.current,
    getCompareMode: () => compareModeRef.current,
    getTargetBranch: () => targetBranchRef.current,
    getLastSignature: () => lastDiffSignatureRef.current,
    onSoftRefresh: (session, mode, branch) => {
      loadReviewForRef.current(session, mode, branch, { soft: true });
    },
    onAfterSignatureChanged: (session, mode) => {
      refreshUntrackedHint(session.projectPath, mode);
    },
  });

  useEffect(() => {
    if (!selectedSessionProjectPath) {
      return;
    }

    loadLocalBranches(selectedSessionProjectPath)
      .then(setLocalBranches)
      .catch(() => setLocalBranches(["main", "master"]));
  }, [selectedSessionId, selectedSessionProjectPath]);

  const toggleFileCollapsed = useCallback((fileId: string) => {
    setCollapsedFileIds((current) => toggleSetValue(current, fileId));
  }, []);

  const toggleAllCollapsed = useCallback(() => {
    setCollapsedFileIds((current) => toggleAllFiles(current, reviewSummary));
  }, [reviewSummary]);

  const runFileAction = useCallback((filePath: string, action: ReviewFileAction) => {
    const session = selectedSessionRef.current;
    if (!session) {
      return;
    }

    setReviewError(null);

    runReviewFileAction(session.projectPath, filePath, action)
      .then(() => {
        const current = selectedSessionRef.current;
        if (!current) {
          return;
        }

        loadReviewForRef.current(current, compareModeRef.current, targetBranchRef.current, { soft: true });
      })
      .catch((error: unknown) => {
        setReviewError(error instanceof Error ? error.message : String(error));
      });
  }, []);

  const runBatchFileAction = useCallback(
    (action: ReviewBatchFileAction) => {
      const session = selectedSessionRef.current;
      if (!session || !reviewSummary) {
        return;
      }

      setReviewError(null);

      runReviewBatchFileAction(session.projectPath, getActionFilePaths(reviewSummary.files), action)
        .then(() => {
          const current = selectedSessionRef.current;
          if (!current) {
            return;
          }

          loadReviewForRef.current(current, compareModeRef.current, targetBranchRef.current, { soft: true });
        })
        .catch((error: unknown) => {
          setReviewError(error instanceof Error ? error.message : String(error));
        });
    },
    [reviewSummary],
  );

  const scrollCacheKey =
    selectedSessionId != null ? getDiffViewCacheKey(selectedSessionId, compareMode, targetBranch) : null;
  const cachedForMode = scrollCacheKey ? readDiffViewSnapshot(scrollCacheKey) : null;

  // 只展示与当前 mode 一致的数据；绝不回退到其他 mode 的 summary。
  const visibleSummary =
    summaryCompareMode === compareMode && reviewSummary
      ? reviewSummary
      : cachedForMode?.mode === compareMode
        ? cachedForMode.summary
        : null;

  return {
    collapsedFileIds,
    compareMode,
    compareModeFileCounts,
    localBranches,
    reviewError,
    reviewSummary: visibleSummary,
    scrollCacheKey,
    selectedFileId,
    untrackedFileCount: isLiveCompareMode(compareMode) ? untrackedFileCount : 0,
    refreshReview,
    runBatchFileAction,
    setCompareMode,
    setSelectedFileId,
    runFileAction,
    toggleAllCollapsed,
    toggleFileCollapsed,
  };
}

function toggleSetValue(source: Set<string>, value: string) {
  const next = new Set(source);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function toggleAllFiles(current: Set<string>, summary: ReviewSummary | null) {
  if (!summary) {
    return current;
  }

  const allFileIds = summary.files.map((file) => file.id);
  const allCollapsed = allFileIds.length > 0 && allFileIds.every((fileId) => current.has(fileId));
  return allCollapsed ? new Set<string>() : new Set(allFileIds);
}

function getActionFilePaths(files: DiffFile[]) {
  return files.map((file) => file.newPath || file.oldPath || file.displayPath);
}

async function loadCompareModeFileCounts(session: ReviewSession, targetBranch: string): Promise<CompareModeFileCounts> {
  const [unstagedResult, stagedResult] = await Promise.all([
    loadReviewDiff({ session, mode: "unstaged", targetBranch }),
    loadReviewDiff({ session, mode: "staged", targetBranch }),
  ]);

  return {
    unstaged: unstagedResult.summary.fileCount,
    staged: stagedResult.summary.fileCount,
  };
}
