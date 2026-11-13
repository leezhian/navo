import type { DiffFile } from "@/domain/types";
import type { CodeViewItem, DiffLineAnnotation } from "@pierre/diffs";
import type { LocalCommentMetadata } from "../diff-viewer/LineComment";

export type DiffCodeViewItem = CodeViewItem<LocalCommentMetadata>;
export type DiffCodeViewAnnotation = DiffLineAnnotation<LocalCommentMetadata>;

export function toCodeViewItems(
  files: DiffFile[],
  collapsedFileIds: Set<string>,
  annotationsByFile: Map<string, DiffCodeViewAnnotation[]>,
  previousItems: DiffCodeViewItem[] = [],
): DiffCodeViewItem[] {
  const previousById = new Map(previousItems.map((item) => [item.id, item]));

  return files.map((file) => {
    const annotations = annotationsByFile.get(file.id);
    const collapsed = collapsedFileIds.has(file.id);
    const version = getDiffCodeViewItemVersion(file, collapsed, annotations);
    const previous = previousById.get(file.id);

    // 版本与 fileDiff 引用都未变时复用旧 item，便于 CodeView 跳过全量 setItems。
    if (
      previous &&
      previous.type === "diff" &&
      previous.version === version &&
      previous.collapsed === collapsed &&
      previous.fileDiff === file.pierreFile &&
      previous.annotations === annotations
    ) {
      return previous;
    }

    return {
      annotations,
      collapsed,
      fileDiff: file.pierreFile,
      id: file.id,
      type: "diff",
      version,
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
