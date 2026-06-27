import { useCallback, useEffect, useState } from "react";
import type { CompareMode, CompareModeFileCounts, ReviewFileAction, ReviewSession, ReviewSummary } from "@/domain/types";
import { loadLocalBranches, loadReviewDiff, runReviewFileAction } from "@/services/reviewApi";

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

  const refreshCompareModeFileCounts = useCallback(() => {
    if (!selectedSession) {
      setCompareModeFileCounts({});
      setReviewSummary(null);
      setReviewError(null);
      setSelectedFileId(null);
      setCollapsedFileIds(new Set());
      return;
    }

    loadCompareModeFileCounts(selectedSession.projectPath, targetBranch)
      .then(setCompareModeFileCounts)
      .catch(() => setCompareModeFileCounts({}));
  }, [selectedSession, targetBranch]);

  const refreshReview = useCallback(() => {
    if (!selectedSession) {
      setCompareModeFileCounts({});
      return;
    }

    setReviewError(null);
    refreshCompareModeFileCounts();

    loadReviewDiff(selectedSession.projectPath, compareMode, targetBranch)
      .then((summary) => {
        if (isTrackedFileCountMode(compareMode)) {
          setCompareModeFileCounts((current) => ({ ...current, [compareMode]: summary.fileCount }));
        }

        setReviewSummary(summary);
        setSelectedFileId(summary.files[0]?.id ?? null);
        setCollapsedFileIds(new Set(summary.files.filter((file) => file.isLarge).map((file) => file.id)));
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

  function toggleFileCollapsed(fileId: string) {
    setCollapsedFileIds((current) => toggleSetValue(current, fileId));
  }

  function toggleAllCollapsed() {
    setCollapsedFileIds((current) => toggleAllFiles(current, reviewSummary));
  }

  function runFileAction(filePath: string, action: ReviewFileAction) {
    if (!selectedSession) {
      return;
    }

    setReviewError(null);

    runReviewFileAction(selectedSession.projectPath, filePath, action)
      .then(refreshReview)
      .catch((error: unknown) => {
        setReviewError(error instanceof Error ? error.message : String(error));
      });
  }

  return {
    collapsedFileIds,
    compareMode,
    compareModeFileCounts,
    localBranches,
    reviewError,
    reviewSummary,
    selectedFileId,
    refreshReview,
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

async function loadCompareModeFileCounts(
  projectPath: string,
  targetBranch: string,
): Promise<CompareModeFileCounts> {
  const [unstagedSummary, stagedSummary] = await Promise.all([
    loadReviewDiff(projectPath, "unstaged", targetBranch),
    loadReviewDiff(projectPath, "staged", targetBranch),
  ]);

  return {
    unstaged: unstagedSummary.fileCount,
    staged: stagedSummary.fileCount,
  };
}
