import { NotebookText, Pencil, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskNoteEditor } from "@/hooks/useTaskNoteEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { getTaskError } from "@/services/taskErrors";

interface TaskNotePaneProps {
  /** 草稿由工作台持有，宽屏面板和窄屏抽屉切换时不丢失编辑内容。 */
  editor: TaskNoteEditor;
  /** 关闭共用右侧区域；由父级处理未保存确认。 */
  onClose: () => void;
}

export function TaskNotePane({ editor, onClose }: TaskNotePaneProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const { note, draft, busy, pending, readOnly } = editor;
  if (!note) return null;
  const title = note.title || t("tasks:resources.untitledNote");
  return <section className="task-workbench-panel task-note-pane" aria-label={t("tasks:notes.title")} aria-busy={busy}>
    <header className="task-workbench-panel-heading">
      <div className="flex min-w-0 items-center gap-2"><NotebookText className="shrink-0" /><span className="truncate text-xs" title={title}>{title}</span></div>
      <div className="flex shrink-0 items-center gap-1">
        {!draft && <IconTooltip label={t("tasks:notes.edit")} size="icon-xs" disabled={readOnly || pending} onClick={editor.edit}><Pencil /></IconTooltip>}
        {!editor.isPrompt && <IconTooltip label={t("tasks:notes.delete")} size="icon-xs" disabled={readOnly || pending} className="hover:bg-destructive/10 hover:text-destructive" onClick={() => editor.requestDelete()}><Trash2 /></IconTooltip>}
        <IconTooltip label={t("tasks:notes.close")} size="icon-xs" disabled={busy} onClick={onClose}><X /></IconTooltip>
      </div>
    </header>
    {draft ? <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      {!editor.isPrompt && <Input aria-label={t("tasks:resources.noteTitle")} placeholder={t("tasks:resources.noteTitle")} value={draft.title} maxLength={160} disabled={busy || readOnly} onChange={(event) => editor.change({ title: event.target.value })} className="h-8 shrink-0 text-xs" />}
      <textarea aria-label={t("tasks:resources.noteContent")} placeholder={t("tasks:resources.noteContent")} value={draft.content} maxLength={100000} disabled={busy || readOnly} onChange={(event) => editor.change({ content: event.target.value })}
        className="min-h-24 flex-1 resize-none rounded-lg border border-input bg-transparent p-3 font-mono text-xs leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
      {editor.error !== null && <p role="alert" className="text-xs text-destructive">{getTaskError(editor.error)}</p>}
      <footer className="flex shrink-0 justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={editor.cancel}>{t("common:actions.cancel")}</Button>
        <Button size="sm" disabled={pending || busy || readOnly || !draft.content.trim()} onClick={() => void editor.save()}>{t(busy ? "common:status.saving" : "common:actions.save")}</Button>
      </footer>
    </div> : <div className="min-h-0 flex-1 overflow-auto p-4 text-[13px] leading-6 whitespace-pre-wrap break-words">{note.content}</div>}
  </section>;
}
