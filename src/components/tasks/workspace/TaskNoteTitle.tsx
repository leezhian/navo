import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskNote } from "@/shared/taskResourceTypes";
import { useTaskStore } from "@/stores/taskStore";
import { useTaskNoteDraftStore, taskNoteDraftKey } from "@/stores/taskNoteDraftStore";
import { Input } from "@/components/ui/input";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { getTaskError } from "@/services/taskErrors";

interface TaskNoteTitleProps {
  /** 标题修改独立于正文编辑，并沿用笔记版本检查。 */
  taskId: string;
  note: TaskNote;
  readOnly: boolean;
  /** 右键菜单的改名请求，消费后由父组件清除。 */
  requested?: boolean;
  onRequestedHandled?: () => void;
}
export function TaskNoteTitle({ taskId, note, readOnly, requested, onRequestedHandled }: TaskNoteTitleProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const [editing, setEditing] = useState(false), [title, setTitle] = useState(note.title), [error, setError] = useState<unknown>(null);
  const pending = useTaskStore((state) => state.pending);
  const input = useRef<HTMLInputElement>(null);
  const original = useRef(note);
  function begin() { if (!readOnly && !pending) { original.current = note; setTitle(note.title); setEditing(true); setError(null); } }
  function cancel() { if (!pending) { setEditing(false); setError(null); } }
  useEffect(() => { if (requested) { begin(); onRequestedHandled?.(); } }, [requested]);
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select(); } }, [editing]);
  async function save() {
    if (pending || readOnly) return;
    const baseline = original.current;
    if (title.trim() === baseline.title) { cancel(); return; }
    try {
      const result = await useTaskStore.getState().updateNote(taskId, { id: note.id, title: title.trim(), content: baseline.content }, baseline.version);
      const saved = result.notes?.find((item) => item.id === note.id);
      const drafts = useTaskNoteDraftStore.getState(), draft = drafts.drafts[taskNoteDraftKey(taskId, note.id)];
      // 独立改名不丢正文草稿；只有草稿基线仍相同时才推进它的版本。
      if (saved && draft?.original.version === baseline.version) drafts.write({ ...draft, original: saved, title: draft.title === baseline.title ? saved.title : draft.title });
      setEditing(false); setError(null);
    } catch (failure) { setError(failure); }
  }
  return <div className="min-w-0 flex-1" onKeyDown={(event) => {
    if (event.key === "F2" && !readOnly) { event.preventDefault(); event.stopPropagation(); begin(); }
  }}>
    {editing ? <div data-note-title-editor className="flex items-center gap-1">
      <Input ref={input} aria-label={t("tasks:resources.noteTitle")} value={title} maxLength={160} disabled={pending || readOnly} onChange={(event) => setTitle(event.target.value)} className="h-7 min-w-0 text-xs"
        onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if (event.key === "Enter") { event.preventDefault(); void save(); } if (event.key === "Escape") { event.stopPropagation(); cancel(); } }} />
      <IconTooltip label={t("common:actions.confirm")} size="icon-xs" disabled={pending || readOnly} onClick={() => void save()}><Check /></IconTooltip>
      <IconTooltip label={t("common:actions.cancel")} size="icon-xs" disabled={pending} onClick={cancel}><X /></IconTooltip>
    </div> : <button type="button" className="block max-w-full truncate text-left text-xs font-semibold" title={note.title || t("tasks:resources.untitledNote")} onDoubleClick={begin}>
      {note.title || t("tasks:resources.untitledNote")}
    </button>}
    {error !== null && <p role="alert" className="text-xs text-destructive">{getTaskError(error)}</p>}
  </div>;
}
