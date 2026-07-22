import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { DiffFile } from "@/domain/types";
import {
  extractHunkForComment,
  formatDiffCommentsExport,
  type DiffCommentExportItem,
} from "@/domain/reviewCommentExport";
import { parseLineCommentId } from "./LineComment";
import { useLocalComments } from "./useLocalComments";

type LocalCommentsApi = ReturnType<typeof useLocalComments>;

interface ReviewCommentsContextValue extends LocalCommentsApi {
  /** 根据当前已保存评论和 diff 文件生成可导出条目。 */
  getExportableComments: (files: DiffFile[]) => DiffCommentExportItem[];
  /** 生成通用模板并写入剪贴板；无评论时返回 false。 */
  copyExportTemplate: (files: DiffFile[]) => Promise<boolean>;
}

const ReviewCommentsContext = createContext<ReviewCommentsContextValue | null>(null);

interface ReviewCommentsProviderProps {
  children: ReactNode;
}

export function ReviewCommentsProvider({ children }: ReviewCommentsProviderProps) {
  const comments = useLocalComments();

  const getExportableComments = useCallback(
    (files: DiffFile[]) => buildExportableComments(comments.activeCommentIds, comments.commentBodies, files),
    [comments.activeCommentIds, comments.commentBodies],
  );

  const copyExportTemplate = useCallback(
    async (files: DiffFile[]) => {
      const exportable = getExportableComments(files);
      if (exportable.length === 0) {
        return false;
      }

      await navigator.clipboard.writeText(formatDiffCommentsExport(exportable));
      return true;
    },
    [getExportableComments],
  );

  const value = useMemo<ReviewCommentsContextValue>(
    () => ({
      ...comments,
      getExportableComments,
      copyExportTemplate,
    }),
    [comments, copyExportTemplate, getExportableComments],
  );

  return <ReviewCommentsContext.Provider value={value}>{children}</ReviewCommentsContext.Provider>;
}

export function useReviewComments() {
  const value = useContext(ReviewCommentsContext);
  if (!value) {
    throw new Error("useReviewComments 必须在 ReviewCommentsProvider 内使用");
  }

  return value;
}

function buildExportableComments(
  activeCommentIds: Set<string>,
  commentBodies: Map<string, string>,
  files: DiffFile[],
): DiffCommentExportItem[] {
  const filesById = new Map(files.map((file) => [file.id, file]));
  const exportable: DiffCommentExportItem[] = [];

  for (const commentId of activeCommentIds) {
    const body = commentBodies.get(commentId)?.trim();
    if (!body) {
      continue;
    }

    const metadata = parseLineCommentId(commentId);
    if (!metadata) {
      continue;
    }

    const file = filesById.get(metadata.fileId);
    if (!file) {
      continue;
    }

    exportable.push({
      filePath: file.displayPath,
      side: metadata.side,
      lineNumber: metadata.lineNumber,
      body,
      hunk: extractHunkForComment(file, metadata.side, metadata.lineNumber),
    });
  }

  return exportable;
}
