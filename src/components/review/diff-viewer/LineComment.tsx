import { Button } from "@/components/ui/button";
import type { DiffLine } from "@/domain/types";
import { MessageCircle, Plus } from "lucide-react";
import classNames from "classnames";
import type { FormEvent } from "react";

export type CommentSide = "old" | "new" | "unified";

interface LineNumberCellProps {
  commentId: string | null;
  lineNumber: number | null | undefined;
  stickyClassName?: string;
  onCommentOpen: (commentId: string) => void;
}

export function LineNumberCell({
  commentId,
  lineNumber,
  stickyClassName = "left-0",
  onCommentOpen,
}: LineNumberCellProps) {
  return (
    <span
      className={classNames(
        "sticky z-10 select-none border-r border-border/40 bg-inherit text-right text-muted-foreground",
        stickyClassName,
      )}
    >
      <span className="block pr-3">{lineNumber ?? ""}</span>
      {commentId && (
        <button
          aria-label="添加本地评论"
          className="absolute top-0 right-1 z-10 hidden size-[22px] items-center justify-center rounded bg-foreground text-background shadow-sm hover:bg-foreground/90 group-hover/line:flex"
          type="button"
          onClick={() => onCommentOpen(commentId)}
        >
          <Plus className="size-3.5" />
        </button>
      )}
    </span>
  );
}

export function LocalCommentBox({ lineLabel, onCancel }: { lineLabel: string; onCancel: () => void }) {
  return (
    <div className="bg-blue-100/70 py-2 pr-2 pl-[60px] dark:bg-blue-950/40">
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

export function getLineCommentId(fileId: string, line: DiffLine, side: CommentSide) {
  return `${fileId}:${side}:${line.id}`;
}

export function getCommentLineLabel(line: DiffLine, side: CommentSide) {
  if (side === "unified") {
    const isOldSideLine = line.type === "delete";
    const lineNumber = isOldSideLine ? line.oldLineNumber : line.newLineNumber ?? line.oldLineNumber;
    return `${isOldSideLine ? "L" : "R"}${lineNumber ?? "-"}`;
  }

  const lineNumber = side === "old" ? line.oldLineNumber : line.newLineNumber;
  const prefix = side === "old" ? "L" : "R";
  return `${prefix}${lineNumber ?? "-"}`;
}
