import type { DiffFile, ReviewSummary } from "@/domain/types";

export function resolveSelectedFileId(files: DiffFile[], currentFileId: string | null) {
  if (currentFileId && files.some((file) => file.id === currentFileId)) {
    return currentFileId;
  }

  return files[0]?.id ?? null;
}

export function getInitialCollapsedFileIds(files: DiffFile[]) {
  return new Set(files.filter((file) => file.isLarge).map((file) => file.id));
}

export function resolveCollapsedFileIds(
  files: DiffFile[],
  currentCollapsedFileIds: Set<string>,
  previousFileIds: Set<string>,
) {
  const nextCollapsedFileIds = new Set<string>();
  const nextFileIds = new Set(files.map((file) => file.id));

  for (const fileId of currentCollapsedFileIds) {
    if (nextFileIds.has(fileId)) {
      nextCollapsedFileIds.add(fileId);
    }
  }

  for (const file of files) {
    if (file.isLarge && !previousFileIds.has(file.id)) {
      nextCollapsedFileIds.add(file.id);
    }
  }

  return areSetsEqual(nextCollapsedFileIds, currentCollapsedFileIds) ? currentCollapsedFileIds : nextCollapsedFileIds;
}

export function createFileIdSet(files: DiffFile[]) {
  return new Set(files.map((file) => file.id));
}

/**
 * 软刷新时复用未改动文件的 DiffFile 引用。
 * CodeView 通过 item 引用相等跳过 setItems 全量重建，有助于保留滚动位置。
 */
export function mergeSoftRefreshSummary(
  previous: ReviewSummary | null,
  next: ReviewSummary,
): ReviewSummary {
  if (!previous || previous.files.length === 0) {
    return next;
  }

  const previousById = new Map(previous.files.map((file) => [file.id, file]));
  let reusedAll = previous.files.length === next.files.length;
  const files = next.files.map((nextFile, index) => {
    const previousFile = previousById.get(nextFile.id);

    if (previousFile && isSameDiffFileContent(previousFile, nextFile)) {
      if (previous.files[index]?.id !== nextFile.id) {
        reusedAll = false;
      }

      return previousFile;
    }

    reusedAll = false;
    return nextFile;
  });

  if (
    reusedAll &&
    previous.additions === next.additions &&
    previous.deletions === next.deletions &&
    previous.fileCount === next.fileCount &&
    previous.isLargeDiff === next.isLargeDiff &&
    files.every((file, index) => file === previous.files[index])
  ) {
    return previous;
  }

  return {
    ...next,
    files,
  };
}

function isSameDiffFileContent(previous: DiffFile, next: DiffFile) {
  return (
    previous.displayPath === next.displayPath &&
    previous.status === next.status &&
    previous.additions === next.additions &&
    previous.deletions === next.deletions &&
    previous.isBinary === next.isBinary &&
    previous.pierreFile.cacheKey === next.pierreFile.cacheKey
  );
}

function areSetsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}
