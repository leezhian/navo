import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { MessageCircle, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

export type CommentSide = "deletions" | "additions";
export type LocalCommentMode = "draft" | "saved" | "editing";

export interface LocalCommentMetadata {
  /** 评论框唯一 id，包含文件、左右侧和行号信息。 */
  id: string;
  /** 评论所属文件 id，用于跨文件 diff 时准确关闭选中态。 */
  fileId: string;
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
  /** 评论框状态变化时通知父层，用于判断是否存在编辑中的评论。 */
  onModeChange: (mode: LocalCommentMode) => void;
  /** 保存评论正文时同步给上层，供导出模板使用。 */
  onSaveBody: (body: string) => void;
}

export function LocalCommentBox({ lineLabel, onCancel, onModeChange, onSaveBody }: LocalCommentBoxProps) {
  const { t: translate } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<LocalCommentMode>("draft");
  const [draftText, setDraftText] = useState("");
  const [savedText, setSavedText] = useState("");
  const hasCommentContent = draftText.trim().length > 0;

  useEffect(() => {
    if (textareaRef.current) {
      resizeCommentTextareaElement(textareaRef.current);
    }
  }, [draftText]);

  useEffect(() => {
    onModeChange(mode);
  }, [mode, onModeChange]);

  function saveComment() {
    if (!hasCommentContent) {
      return;
    }

    const nextText = draftText.trim();
    setDraftText(nextText);
    setSavedText(nextText);
    onSaveBody(nextText);
    setMode("saved");
    textareaRef.current?.blur();
  }

  function cancelEdit() {
    if (mode === "draft") {
      onCancel();
      return;
    }

    setDraftText(savedText);
    setMode("saved");
  }

  function enterEditingMode() {
    if (mode === "saved") {
      setMode("editing");
    }
  }

  return (
    <div className="p-2">
      <div className="w-full max-w-[756px] overflow-hidden rounded-xl bg-white shadow-sm dark:bg-card">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border/50 px-4 py-2">
          <div className="flex shrink-0 items-center gap-2.5 font-sans text-sm font-normal">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted">
              <MessageCircle className="size-3" />
            </span>
            <span>{translate("本地评论")}</span>
          </div>
          <span className="shrink-0 font-sans text-xs text-muted-foreground">
            {translate("对第 {{line}} 行发表评论", { line: lineLabel })}
          </span>
        </div>
        <textarea
          ref={textareaRef}
          className="min-h-9 w-full resize-none overflow-hidden bg-transparent px-4 py-2 font-sans text-sm outline-none placeholder:text-muted-foreground/60"
          placeholder={translate("请求更改")}
          rows={1}
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          onFocus={enterEditingMode}
          onInput={resizeCommentTextarea}
        />
        <LocalCommentActions
          canSave={hasCommentContent}
          mode={mode}
          onCancel={cancelEdit}
          onDelete={onCancel}
          onSave={saveComment}
        />
      </div>
    </div>
  );
}

function resizeCommentTextarea(event: FormEvent<HTMLTextAreaElement>) {
  resizeCommentTextareaElement(event.currentTarget);
}

function resizeCommentTextareaElement(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

interface LocalCommentActionsProps {
  /** 文本框是否有可提交内容；没有内容时注释/保存按钮禁用。 */
  canSave: boolean;
  /** 当前评论框展示状态，决定底部按钮组合。 */
  mode: LocalCommentMode;
  /** 草稿态关闭评论框，编辑态放弃本次改动。 */
  onCancel: () => void;
  /** 删除已打开的本地评论 annotation。 */
  onDelete: () => void;
  /** 提交草稿或保存编辑内容。 */
  onSave: () => void;
}

function LocalCommentActions({ canSave, mode, onCancel, onDelete, onSave }: LocalCommentActionsProps) {
  const { t: translate } = useTranslation();
  if (mode === "saved") {
    return (
      <div className="flex justify-end px-4 pb-3">
        <Button className="font-normal text-muted-foreground" size="sm" type="button" variant="ghost" onClick={onDelete}>
          {translate("删除")}</Button>
      </div>
    );
  }

  return (
    <div className="flex justify-between gap-2 px-4 pb-3">
      {mode === "editing" ? (
        <Button className="font-normal" size="sm" type="button" variant="destructive" onClick={onDelete}>
          {translate("删除")}</Button>
      ) : (
        <span />
      )}
      <span className="flex gap-2">
        <Button className="font-normal text-muted-foreground" size="sm" type="button" variant="ghost" onClick={onCancel}>
          {translate("取消")}</Button>
        <Button className="font-normal" disabled={!canSave} size="sm" type="button" onClick={onSave}>
          {mode === "editing" ? translate("保存") : translate("注释")}
        </Button>
      </span>
    </div>
  );
}

interface LocalCommentButtonProps {
  /** 点击行号上的加号按钮时打开对应行的本地评论框。 */
  onClick: () => void;
}

export function LocalCommentButton({ onClick }: LocalCommentButtonProps) {
  const { t: translate } = useTranslation();
  return (
    <button
      aria-label={translate("添加本地评论")}
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
  const fileId = parts.slice(0, -2).join(":");

  if (!fileId || (side !== "deletions" && side !== "additions") || !Number.isFinite(lineNumber)) {
    return null;
  }

  return {
    id: commentId,
    fileId,
    lineNumber,
    lineLabel: getCommentLineLabel(side, lineNumber),
    side,
  };
}
