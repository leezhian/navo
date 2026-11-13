import { useCallback, useRef, useState } from "react";
import { Bold, Italic, Code, List, ListChecks, Link } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Button } from "@/components/ui/button";
import { TaskNoteMarkdown } from "./TaskNoteMarkdown";
import { TASK_NOTE_CONTENT_LIMIT } from "@/utils/taskNotes";

interface TaskMarkdownEditorProps {
  /** 原始 Markdown；编辑与预览共用同一草稿。 */
  value: string;
  /** 每次编辑更新同一份正文草稿，不直接写入已保存笔记。 */
  onChange: (value: string) => void;
  /** 写入期间和归档任务禁止编辑。 */
  disabled?: boolean;
  /** 沿用工作台的阅读位置记忆。 */
  textareaRef?: (element: HTMLTextAreaElement | null) => void;
}
export function TaskMarkdownEditor({ value, onChange, disabled, textareaRef }: TaskMarkdownEditorProps) {
  const { t } = useTranslation(["tasks"]);
  const field = useRef<HTMLTextAreaElement>(null);
  const attachField = useCallback((element: HTMLTextAreaElement | null) => { field.current = element; return textareaRef?.(element); }, [textareaRef]);
  const [preview, setPreview] = useState(false);
  function format(before: string, after = "") {
    const input = field.current;
    if (!input || disabled) return;
    const start = input.selectionStart, end = input.selectionEnd;
    const next = value.slice(0, start) + before + value.slice(start, end) + after + value.slice(end);
    if (next.length > TASK_NOTE_CONTENT_LIMIT) return;
    onChange(next);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + before.length, end + before.length); });
  }
  const actions = [
    { key: "bold", icon: Bold, before: "**", after: "**" }, { key: "italic", icon: Italic, before: "*", after: "*" },
    { key: "code", icon: Code, before: "`", after: "`" }, { key: "list", icon: List, before: "- " },
    { key: "checklist", icon: ListChecks, before: "- [ ] " }, { key: "link", icon: Link, before: "[", after: "](https://)" },
  ] as const;
  return <div className="flex min-h-24 flex-1 flex-col overflow-hidden rounded-lg border border-input">
    <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border px-2 py-1">
      {actions.map(({ key, icon: Icon, before, ...rest }) => <IconTooltip key={key} size="icon-xs" label={t(`tasks:notes.format.${key}`)} disabled={disabled || preview}
        onMouseDown={(event) => event.preventDefault()} onClick={() => format(before, "after" in rest ? rest.after : "")}><Icon /></IconTooltip>)}
      <Button variant="ghost" size="sm" className="ml-auto text-xs" aria-pressed={preview} onClick={() => setPreview(!preview)}>{t(preview ? "tasks:notes.source" : "tasks:notes.preview")}</Button>
    </div>
    {preview ? <div className="min-h-0 flex-1 overflow-auto p-3"><TaskNoteMarkdown content={value} /></div>
      : <textarea ref={attachField} aria-label={t("tasks:resources.noteContent")} placeholder={t("tasks:resources.noteContent")} value={value} maxLength={TASK_NOTE_CONTENT_LIMIT} disabled={disabled}
        onChange={(event) => onChange(event.target.value)} className="min-h-24 flex-1 resize-none bg-transparent p-3 font-mono text-xs leading-6 outline-none" />}
  </div>;
}
