import { useEffect, useMemo, useState } from "react";
import {
  getLineCommentId,
  parseLineCommentId,
  type LocalCommentMode,
} from "./LineComment";
import {
  isSameCommentTarget,
  type LocalCommentTarget,
} from "./commentSelection";

export function useLocalComments() {
  const [activeCommentIds, setActiveCommentIds] = useState<Set<string>>(new Set());
  const [commentModes, setCommentModes] = useState<Map<string, LocalCommentMode>>(new Map());
  const [selectedCommentTarget, setSelectedCommentTarget] = useState<LocalCommentTarget | null>(null);

  const hasEditingComment = useMemo(
    () => Array.from(commentModes.values()).some((mode) => mode !== "saved"),
    [commentModes],
  );
  const activeSelectedCommentTarget = hasEditingComment ? selectedCommentTarget : null;

  useEffect(() => {
    if (!hasEditingComment && selectedCommentTarget) {
      setSelectedCommentTarget(null);
    }
  }, [hasEditingComment, selectedCommentTarget]);

  function openLineComment(target: LocalCommentTarget) {
    const commentId = getLineCommentId(target.fileId, target.side, target.lineNumber);
    setSelectedCommentTarget(target);
    setActiveCommentIds((current) => new Set(current).add(commentId));
    setCommentModes((current) => {
      if (current.has(commentId)) {
        return current;
      }

      return new Map(current).set(commentId, "draft");
    });
  }

  function closeLineComment(commentId: string) {
    updateSelectedTargetFromComment(commentId, "clear-if-current");
    setActiveCommentIds((current) => {
      const next = new Set(current);
      next.delete(commentId);
      return next;
    });
    setCommentModes((current) => {
      const next = new Map(current);
      next.delete(commentId);
      return next;
    });
  }

  function updateLineCommentMode(commentId: string, mode: LocalCommentMode) {
    if (mode === "editing") {
      updateSelectedTargetFromComment(commentId, "select");
    }

    if (mode === "saved") {
      updateSelectedTargetFromComment(commentId, "clear-if-current");
    }

    setCommentModes((current) => {
      if (current.get(commentId) === mode) {
        return current;
      }

      return new Map(current).set(commentId, mode);
    });
  }

  function selectCommentTarget(target: LocalCommentTarget) {
    setSelectedCommentTarget((current) => (isSameCommentTarget(current, target) ? current : target));
  }

  function updateSelectedTargetFromComment(commentId: string, action: "select" | "clear-if-current") {
    const metadata = parseLineCommentId(commentId);

    if (!metadata) {
      return;
    }

    const target = {
      fileId: metadata.fileId,
      lineNumber: metadata.lineNumber,
      side: metadata.side,
    };

    setSelectedCommentTarget((current) => {
      if (action === "select") {
        return isSameCommentTarget(current, target) ? current : target;
      }

      return isSameCommentTarget(current, target) ? null : current;
    });
  }

  return {
    activeCommentIds,
    hasEditingComment,
    selectedCommentTarget: activeSelectedCommentTarget,
    closeLineComment,
    openLineComment,
    selectCommentTarget,
    updateLineCommentMode,
  };
}
