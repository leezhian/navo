import { Button } from "@/components/ui/button";
import { MessageCircle, Plus } from "lucide-react";
import type { FormEvent } from "react";

export type CommentSide = "deletions" | "additions";

export interface LocalCommentMetadata {
  id: string;
  lineNumber: number;
  lineLabel: string;
  side: CommentSide;
}

export function LocalCommentBox({ lineLabel, onCancel }: { lineLabel: string; onCancel: () => void }) {
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

export function LocalCommentButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      aria-label="添加本地评论"
      className="relative z-30 flex size-[22px] items-center justify-center rounded bg-foreground text-background shadow-sm hover:bg-foreground/90"
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
