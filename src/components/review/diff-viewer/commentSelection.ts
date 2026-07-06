import type { SelectedLineRange } from "@pierre/diffs";
import type { CommentSide } from "./LineComment";

export interface LocalCommentTarget {
  /** 目标评论所属文件 id，用于在多文件 diff 中定位唯一行。 */
  fileId: string;
  /** 目标行所在 diff 侧；删除行为 L，新增和上下文行为 R。 */
  side: CommentSide;
  /** 目标行号，直接对应 Pierre 返回的 lineNumber。 */
  lineNumber: number;
}

export function getSingleRowSelection(target: LocalCommentTarget): SelectedLineRange {
  // Pierre 在 split 模式会按行索引渲染 selection，单侧行号足以让同一 diff 行的左右两列一起高亮。
  return {
    end: target.lineNumber,
    endSide: target.side,
    side: target.side,
    start: target.lineNumber,
  };
}

export function isSameCommentTarget(left: LocalCommentTarget | null, right: LocalCommentTarget | null) {
  return left?.fileId === right?.fileId && left?.side === right?.side && left?.lineNumber === right?.lineNumber;
}
