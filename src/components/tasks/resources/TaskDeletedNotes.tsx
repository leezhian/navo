import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTaskError } from "@/services/taskErrors";
import { useDeletedTaskNotes } from "@/hooks/useDeletedTaskNotes";
import { TaskDeletedNoteHistory } from "./TaskDeletedNoteHistory";

interface TaskDeletedNotesProps {
  /** 任务版本变化后重新读取回收内容，不混入活动笔记计数。 */
  taskId: string;
  contextVersion?: number;
  /** 归档任务只读；其他资源操作期间禁止恢复。 */
  readOnly: boolean;
  busy: boolean;
}

export function TaskDeletedNotes({ taskId, contextVersion, readOnly, busy }: TaskDeletedNotesProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const deleted = useDeletedTaskNotes(taskId, contextVersion);
  const selected = deleted.notes.find((note) => note.id === selectedId);
  return <section className="space-y-3" data-deleted-notes>
    <Button variant="ghost" size="sm" data-deleted-toggle aria-expanded={open} onClick={() => setOpen(!open)}><Trash2 />{t("tasks:resources.deleted.title")} ({deleted.notes.length})</Button>
    {deleted.error !== null && <div role="alert" className="text-xs text-destructive">{getTaskError(deleted.error)}<Button variant="ghost" size="sm" disabled={deleted.loading} onClick={deleted.reload}>{t("common:actions.retry")}</Button></div>}
    {open && <>
      <p className="text-xs text-muted-foreground">{t("tasks:resources.deleted.description")}</p>
      {selected ? <TaskDeletedNoteHistory key={selected.id} taskId={taskId} note={selected} busy={busy || deleted.loading} readOnly={readOnly} onBack={() => setSelectedId(null)} onRestore={(version) => {
        void deleted.restore(selected, version).then((restored) => { if (restored) setSelectedId(null); });
      }} /> : deleted.loading ? <p role="status" className="text-xs text-muted-foreground">{t("common:status.loading")}</p> : <ul className="space-y-1">
        {deleted.notes.map((note) => <li key={note.id} data-deleted-note={note.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted/60">
          <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => setSelectedId(note.id)}>{note.title || t("tasks:resources.untitledNote")}</button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(note.id)}>{t("tasks:notes.history.title")}</Button>
          {!readOnly && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void deleted.restore(note)}>{t("tasks:resources.restore")}</Button>}
        </li>)}
        {!deleted.notes.length && <li className="text-xs text-muted-foreground">{t("tasks:resources.deleted.empty")}</li>}
      </ul>}
    </>}
  </section>;
}
