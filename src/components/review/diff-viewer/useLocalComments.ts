import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [commentBodies, setCommentBodies] = useState<Map<string, string>>(new Map());
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

  const updateSelectedTargetFromComment = useCallback((commentId: string, action: "select" | "clear-if-current") => {
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
  }, []);

  const openLineComment = useCallback((target: LocalCommentTarget) => {
    const commentId = getLineCommentId(target.fileId, target.side, target.lineNumber);
    setSelectedCommentTarget((current) => (isSameCommentTarget(current, target) ? current : target));
    setActiveCommentIds((current) => {
      if (current.has(commentId)) {
        return current;
      }

      return new Set(current).add(commentId);
    });
    setCommentModes((current) => {
      if (current.has(commentId)) {
        return current;
      }

      return new Map(current).set(commentId, "draft");
    });
  }, []);

  const closeLineComment = useCallback((commentId: string) => {
    updateSelectedTargetFromComment(commentId, "clear-if-current");
    setActiveCommentIds((current) => {
      if (!current.has(commentId)) {
        return current;
      }

      const next = new Set(current);
      next.delete(commentId);
      return next;
    });
    setCommentBodies((current) => {
      if (!current.has(commentId)) {
        return current;
      }

      const next = new Map(current);
      next.delete(commentId);
      return next;
    });
    setCommentModes((current) => {
      if (!current.has(commentId)) {
        return current;
      }

      const next = new Map(current);
      next.delete(commentId);
      return next;
    });
  }, [updateSelectedTargetFromComment]);

  const saveCommentBody = useCallback((commentId: string, body: string) => {
    const nextBody = body.trim();
    setCommentBodies((current) => {
      if (current.get(commentId) === nextBody) {
        return current;
      }

      return new Map(current).set(commentId, nextBody);
    });
  }, []);

  const updateLineCommentMode = useCallback((commentId: string, mode: LocalCommentMode) => {
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
  }, [updateSelectedTargetFromComment]);

  const selectCommentTarget = useCallback((target: LocalCommentTarget) => {
    setSelectedCommentTarget((current) => (isSameCommentTarget(current, target) ? current : target));
  }, []);

  return {
    activeCommentIds,
    commentBodies,
    hasEditingComment,
    selectedCommentTarget: activeSelectedCommentTarget,
    closeLineComment,
    openLineComment,
    saveCommentBody,
    selectCommentTarget,
    updateLineCommentMode,
  };
}
