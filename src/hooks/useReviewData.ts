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
import { loadLocalBranches, loadReviewDiff, runReviewBatchFileAction, runReviewFileAction } from "@/services/reviewApi";
import {
  createFileIdSet,
  getInitialCollapsedFileIds,
  resolveCollapsedFileIds,
  resolveSelectedFileId,
} from "./reviewDataState";

interface UseReviewDataParams {
  /** 当前选中的审查会话；为空时停止加载 diff，并清空对比方式文件数。 */
  selectedSession: ReviewSession | null;
  /** 分支对比模式使用的目标分支名称。 */
  targetBranch: string;
}

export function useReviewData({ selectedSession, targetBranch }: UseReviewDataParams) {
  const [compareMode, setCompareMode] = useState<CompareMode>("previous-session");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [collapsedFileIds, setCollapsedFileIds] = useState<Set<string>>(new Set());
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [localBranches, setLocalBranches] = useState<string[]>(["main", "master"]);
  const [compareModeFileCounts, setCompareModeFileCounts] = useState<CompareModeFileCounts>({});
  const reviewScopeKeyRef = useRef<string | null>(null);
  const reviewFileIdsRef = useRef<Set<string>>(new Set());

  const refreshCompareModeFileCounts = useCallback(() => {
    if (!selectedSession) {
      setCompareModeFileCounts({});
      setReviewSummary(null);
      setReviewError(null);
      setSelectedFileId(null);
      setCollapsedFileIds(new Set());
      reviewScopeKeyRef.current = null;
      reviewFileIdsRef.current = new Set();
      return;
    }

    loadCompareModeFileCounts(selectedSession, targetBranch)
      .then(setCompareModeFileCounts)
      .catch(() => setCompareModeFileCounts({}));
  }, [selectedSession, targetBranch]);

  const refreshReview = useCallback(() => {
    if (!selectedSession) {
      setCompareModeFileCounts({});
      reviewScopeKeyRef.current = null;
      reviewFileIdsRef.current = new Set();
      return;
    }

    setReviewError(null);
    refreshCompareModeFileCounts();

    const nextScopeKey = getReviewScopeKey(selectedSession, compareMode, targetBranch);
    loadReviewDiff({ session: selectedSession, mode: compareMode, targetBranch })
      .then((summary) => {
        const previousScopeKey = reviewScopeKeyRef.current;
        const previousFileIds = previousScopeKey === nextScopeKey ? reviewFileIdsRef.current : new Set<string>();

        if (isTrackedFileCountMode(compareMode)) {
          setCompareModeFileCounts((current) => ({ ...current, [compareMode]: summary.fileCount }));
        }

        setReviewSummary(summary);
        setSelectedFileId((current) => resolveSelectedFileId(summary.files, current));
        setCollapsedFileIds((current) =>
          previousScopeKey === nextScopeKey
            ? resolveCollapsedFileIds(summary.files, current, previousFileIds)
            : getInitialCollapsedFileIds(summary.files),
        );
        reviewScopeKeyRef.current = nextScopeKey;
        reviewFileIdsRef.current = createFileIdSet(summary.files);
      })
      .catch((error: unknown) => {
        setReviewError(error instanceof Error ? error.message : String(error));
      });
  }, [compareMode, refreshCompareModeFileCounts, selectedSession, targetBranch]);

  useEffect(() => {
    refreshReview();
  }, [refreshReview]);

  useEffect(() => {
    if (!selectedSession) {
      return;
    }

    loadLocalBranches(selectedSession.projectPath)
      .then(setLocalBranches)
      .catch(() => setLocalBranches(["main", "master"]));
  }, [selectedSession]);

  const toggleFileCollapsed = useCallback((fileId: string) => {
    setCollapsedFileIds((current) => toggleSetValue(current, fileId));
  }, []);

  const toggleAllCollapsed = useCallback(() => {
    setCollapsedFileIds((current) => toggleAllFiles(current, reviewSummary));
  }, [reviewSummary]);

  const runFileAction = useCallback((filePath: string, action: ReviewFileAction) => {
    if (!selectedSession) {
      return;
    }

    setReviewError(null);

    runReviewFileAction(selectedSession.projectPath, filePath, action)
      .then(refreshReview)
      .catch((error: unknown) => {
        setReviewError(error instanceof Error ? error.message : String(error));
      });
  }, [refreshReview, selectedSession]);

  const runBatchFileAction = useCallback((action: ReviewBatchFileAction) => {
    if (!selectedSession || !reviewSummary) {
      return;
    }

    setReviewError(null);

    runReviewBatchFileAction(selectedSession.projectPath, getActionFilePaths(reviewSummary.files), action)
      .then(refreshReview)
      .catch((error: unknown) => {
        setReviewError(error instanceof Error ? error.message : String(error));
      });
  }, [refreshReview, reviewSummary, selectedSession]);

  return {
    collapsedFileIds,
    compareMode,
    compareModeFileCounts,
    localBranches,
    reviewError,
    reviewSummary,
    selectedFileId,
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

function isTrackedFileCountMode(mode: CompareMode) {
  return mode === "unstaged" || mode === "staged";
}

function getActionFilePaths(files: DiffFile[]) {
  return files.map((file) => file.newPath || file.oldPath || file.displayPath);
}

function getReviewScopeKey(session: ReviewSession, compareMode: CompareMode, targetBranch: string) {
  return `${session.id}:${compareMode}:${targetBranch}`;
}

async function loadCompareModeFileCounts(session: ReviewSession, targetBranch: string): Promise<CompareModeFileCounts> {
  const [unstagedSummary, stagedSummary] = await Promise.all([
    loadReviewDiff({ session, mode: "unstaged", targetBranch }),
    loadReviewDiff({ session, mode: "staged", targetBranch }),
  ]);

  return {
    unstaged: unstagedSummary.fileCount,
    staged: stagedSummary.fileCount,
  };
}
