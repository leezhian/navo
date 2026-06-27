import { Button } from "@/components/ui/button";
import { MessageCircle, Plus } from "lucide-react";
import type { FormEvent } from "react";

export type CommentSide = "deletions" | "additions";

export interface LocalCommentMetadata {
  /** 评论框唯一 id，包含文件、左右侧和行号信息。 */
  id: string;
  /** Pierre annotation 需要定位的目标行号。 */
  lineNumber: number;
  /** 展示给用户的行号标签，例如 L12 或 R24。 */
  lineLabel: string;
  /** 评论所在 diff 侧；删除行为 L，新增和上下文行为 R。 */
  side: CommentSide;
}

interface LocalCommentBoxProps {
  /** 展示在评论框标题右侧的 L/R 行号标签。 */
  lineLabel: string;
  /** 取消当前评论时关闭对应 annotation。 */
  onCancel: () => void;
}

export function LocalCommentBox({ lineLabel, onCancel }: LocalCommentBoxProps) {
  return (
    <div className="bg-blue-100/70 p-2 dark:bg-blue-950/40">
      <div className="overflow-hidden rounded-xl bg-background shadow-sm">
        <div className="flex h-12 items-center justify-between border-b border-border/50 px-4">
          <div className="flex items-center gap-2.5 font-sans text-sm font-medium">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted">
              <MessageCircle className="size-3" />
            </span>
            <span>本地评论</span>
          </div>
          <span className="font-sans text-xs text-muted-foreground">对第 {lineLabel} 行发表评论</span>
        </div>
        <textarea
          className="min-h-9 w-full resize-none overflow-hidden bg-transparent px-4 py-2 font-sans text-sm outline-none placeholder:text-muted-foreground/60"
          placeholder="请求更改"
          rows={1}
          onInput={resizeCommentTextarea}
        />
        <div className="flex justify-end gap-2 px-4 pb-3">
          <Button size="sm" type="button" variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button size="sm" type="button">
            注释
          </Button>
        </div>
      </div>
    </div>
  );
}

function resizeCommentTextarea(event: FormEvent<HTMLTextAreaElement>) {
  const textarea = event.currentTarget;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

interface LocalCommentButtonProps {
  /** 点击行号上的加号按钮时打开对应行的本地评论框。 */
  onClick: () => void;
}

export function LocalCommentButton({ onClick }: LocalCommentButtonProps) {
  return (
    <button
      aria-label="添加本地评论"
      className="relative z-30 flex size-[1lh] items-center justify-center rounded bg-foreground text-background shadow-sm hover:bg-foreground/90"
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Plus className="size-3.5" />
    </button>
  );
}

export function getLineCommentId(fileId: string, side: CommentSide, lineNumber: number) {
  return `${fileId}:${side}:${lineNumber}`;
}

export function getCommentLineLabel(side: CommentSide, lineNumber: number) {
  return `${side === "deletions" ? "L" : "R"}${lineNumber}`;
}

export function parseLineCommentId(commentId: string): LocalCommentMetadata | null {
  const parts = commentId.split(":");
  const side = parts[parts.length - 2];
  const rawLineNumber = parts[parts.length - 1];
  const lineNumber = Number(rawLineNumber);

  if ((side !== "deletions" && side !== "additions") || !Number.isFinite(lineNumber)) {
    return null;
  }

  return {
    id: commentId,
    lineNumber,
    lineLabel: getCommentLineLabel(side, lineNumber),
    side,
  };
}
