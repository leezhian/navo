import type { AppSettings, ReviewSummary } from "@/domain/types";
import classNames from "classnames";

export function getEffectiveReadingMode(summary: ReviewSummary | null, settings: AppSettings) {
  // 大量 diff 时强制单文件模式，避免连续渲染把桌面窗口拖慢。
  return summary?.isLargeDiff ? "single-file" : settings.readingMode;
}

export function getVisibleFiles(
  summary: ReviewSummary | null,
  readingMode: AppSettings["readingMode"],
  selectedFileId: string | null,
) {
  if (!summary) {
    return [];
  }

  if (readingMode === "single-file") {
    return summary.files.filter((file) => file.id === selectedFileId).slice(0, 1);
  }

  return summary.files;
}

export function getIsAllCollapsed(summary: ReviewSummary | null, collapsedFileIds: Set<string>) {
  if (!summary || summary.files.length === 0) {
    return false;
  }

  return summary.files.every((file) => collapsedFileIds.has(file.id));
}

export function getReviewLayoutClassName() {
  return classNames("grid min-h-0 overflow-hidden");
}

export function getReviewLayoutStyle(isFileTreeVisible: boolean, fileTreeWidth: number) {
  return {
    gridTemplateColumns: isFileTreeVisible ? `minmax(0, 1fr) ${fileTreeWidth}px` : "minmax(0, 1fr) 0px",
  };
}

export function getReviewPaneClassName(isFileTreeVisible: boolean, wrapDiffLines: boolean) {
  return classNames(
    "min-w-0 overflow-auto overscroll-none bg-background",
    isFileTreeVisible && "border-r",
    wrapDiffLines &&
      "[&_.diff-code-line]:min-w-0 [&_.diff-code-line]:grid-cols-[52px_minmax(0,1fr)] [&_.split-diff-row]:min-w-0 [&_.split-diff-row]:grid-cols-2 [&_code]:whitespace-pre-wrap [&_code]:break-words",
  );
}
