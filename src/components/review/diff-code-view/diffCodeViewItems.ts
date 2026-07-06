import type { DiffFile } from "@/domain/types";
import type { CodeViewItem, DiffLineAnnotation } from "@pierre/diffs";
import type { LocalCommentMetadata } from "../diff-viewer/LineComment";

export type DiffCodeViewItem = CodeViewItem<LocalCommentMetadata>;
export type DiffCodeViewAnnotation = DiffLineAnnotation<LocalCommentMetadata>;

export function toCodeViewItems(
  files: DiffFile[],
  collapsedFileIds: Set<string>,
  annotationsByFile: Map<string, DiffCodeViewAnnotation[]>,
): DiffCodeViewItem[] {
  return files.map((file) => {
    const annotations = annotationsByFile.get(file.id);
    const collapsed = collapsedFileIds.has(file.id);

    return {
      annotations,
      collapsed,
      fileDiff: file.pierreFile,
      id: file.id,
      type: "diff",
      version: getDiffCodeViewItemVersion(file, collapsed, annotations),
    };
  });
}

export function createDiffFileMap(files: DiffFile[]) {
  return new Map(files.map((file) => [file.id, file]));
}

function getDiffCodeViewItemVersion(
  file: DiffFile,
  collapsed: boolean,
  annotations: DiffCodeViewAnnotation[] | undefined,
) {
  const annotationKey = annotations?.map((annotation) => annotation.metadata.id).join(",") ?? "";

  return hashString(
    [
      file.id,
      file.pierreFile.cacheKey ?? "",
      file.pierreFile.splitLineCount,
      file.pierreFile.unifiedLineCount,
      file.additions,
      file.deletions,
      file.status,
      collapsed,
      annotationKey,
    ].join("|"),
  );
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}
