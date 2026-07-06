import type { DiffFile } from "@/domain/types";

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
