import type { AppSettings, ReviewSummary } from "@/domain/types";

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

export function getReviewLayoutClassName(isFileTreeVisible: boolean) {
  return isFileTreeVisible
    ? "grid min-h-0 overflow-hidden grid-cols-[minmax(0,1fr)_390px]"
    : "grid min-h-0 overflow-hidden grid-cols-[minmax(0,1fr)]";
}

export function getReviewPaneClassName(isFileTreeVisible: boolean, wrapDiffLines: boolean) {
  const baseClassName = isFileTreeVisible
    ? "min-w-0 overflow-auto border-r bg-background"
    : "min-w-0 overflow-auto bg-background";

  return wrapDiffLines
    ? `${baseClassName} [&_code]:whitespace-pre-wrap [&_code]:break-words`
    : baseClassName;
}
