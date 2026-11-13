import type { CodeViewLineSelection } from "@pierre/diffs";
import { useMemo } from "react";
import { getSingleRowSelection } from "../diff-viewer/commentSelection";
import { parseLineCommentId } from "../diff-viewer/LineComment";
import { useReviewComments } from "../diff-viewer/reviewCommentsContext";
import type { DiffCodeViewAnnotation } from "./diffCodeViewItems";

export function useDiffCodeViewComments() {
  const comments = useReviewComments();
  const annotationsByFile = useMemo(() => getAnnotationsByFile(comments.activeCommentIds), [comments.activeCommentIds]);
  const selectedLines = useMemo<CodeViewLineSelection | null>(() => {
    if (!comments.selectedCommentTarget) {
      return null;
    }

    return {
      id: comments.selectedCommentTarget.fileId,
      range: getSingleRowSelection(comments.selectedCommentTarget),
    };
  }, [comments.selectedCommentTarget]);

  return {
    ...comments,
    annotationsByFile,
    selectedLines,
  };
}

function getAnnotationsByFile(activeCommentIds: Set<string>) {
  const annotationsByFile = new Map<string, DiffCodeViewAnnotation[]>();

  for (const commentId of activeCommentIds) {
    const metadata = parseLineCommentId(commentId);

    if (!metadata) {
      continue;
    }

    const annotations = annotationsByFile.get(metadata.fileId) ?? [];
    annotations.push({
      lineNumber: metadata.lineNumber,
      metadata,
      side: metadata.side,
    });
    annotationsByFile.set(metadata.fileId, annotations);
  }

  return annotationsByFile;
}
