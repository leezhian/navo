import { useRef, useState } from "react";
import type { Task } from "@/domain/tasks";
import type { TaskNote } from "@/shared/taskResourceTypes";
import { useTaskStore } from "@/stores/taskStore";
import { TASK_PROMPT_ID } from "@/shared/taskContextTypes";
import { useTranslation } from "react-i18next";

type NoteDraft = { taskId: string; original: TaskNote; title: string; content: string };
type NoteConfirmation = { kind: "delete"; noteId: string } | { kind: "discard"; proceed: () => void };

export function useTaskNoteEditor(task: Task, noteId: string | undefined, onDeleted: () => void) {
  const { t } = useTranslation(["tasks", "common"]);
  const isPrompt = noteId === TASK_PROMPT_ID;
  const note = isPrompt ? { id: TASK_PROMPT_ID, title: t("tasks:context.prompt"), content: task.description ?? "" } : task.notes?.find((item) => item.id === noteId);
  const [storedDraft, setDraft] = useState<NoteDraft | null>(null);
  const [confirmation, setConfirmation] = useState<NoteConfirmation | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const pending = useTaskStore((state) => state.pending);
  const draft = note && storedDraft?.taskId === task.id && storedDraft.original.id === note.id ? storedDraft : null;
  const dirty = Boolean(draft && (draft.title !== draft.original.title || draft.content !== draft.original.content));
  const readOnly = task.status === "ARCHIVED";
  const deletionNote = confirmation?.kind === "delete" ? task.notes?.find((item) => item.id === confirmation.noteId) : undefined;
  const visibleConfirmation = confirmation?.kind === "delete" ? deletionNote ? confirmation : null : note ? confirmation : null;

  function reset() { setDraft(null); setError(null); setConfirmation(null); }
  function leave(proceed: () => void) {
    if (saving.current || visibleConfirmation) return;
    if (dirty) setConfirmation({ kind: "discard", proceed });
    else { reset(); proceed(); }
  }
  function edit() {
    if (!note || readOnly || saving.current) return;
    setDraft({ taskId: task.id, original: note, title: note.title, content: note.content });
    setError(null);
  }
  async function save() {
    if (!draft || !draft.content.trim() || readOnly || pending || saving.current) return;
    saving.current = true; setBusy(true); setError(null);
    try {
      if (isPrompt) await useTaskStore.getState().updatePrompt(task.id, draft.content, draft.original.content);
      else await useTaskStore.getState().updateNote(task.id, { id: draft.original.id, title: draft.title, content: draft.content }, draft.original);
      reset();
    } catch (failure) { setError(failure); }
    finally { saving.current = false; setBusy(false); }
  }
  async function confirm() {
    if (!confirmation || saving.current) return;
    if (confirmation.kind === "discard") {
      const proceed = confirmation.proceed;
      reset(); proceed(); return;
    }
    if (!deletionNote || readOnly || pending) return;
    saving.current = true; setBusy(true); setError(null);
    try {
      await useTaskStore.getState().deleteNote(task.id, deletionNote.id);
      if (deletionNote.id === note?.id) { reset(); onDeleted(); }
      else { setConfirmation(null); setError(null); }
    } catch (failure) { setError(failure); }
    finally { saving.current = false; setBusy(false); }
  }
  return {
    note, isPrompt, deletionNote, draft, dirty, error, busy, pending, readOnly, confirmation: visibleConfirmation,
    edit, leave, save, confirm,
    change: (patch: Partial<Pick<TaskNote, "title" | "content">>) => setDraft((current) => current ? { ...current, ...patch } : null),
    cancel: () => leave(() => undefined),
    requestDelete: (id = note?.id) => { if (id && task.notes?.some((item) => item.id === id) && !readOnly && !pending && !saving.current) { setError(null); setConfirmation({ kind: "delete", noteId: id }); } },
    cancelConfirmation: () => { if (!saving.current) { setConfirmation(null); setError(null); } },
  };
}

export type TaskNoteEditor = ReturnType<typeof useTaskNoteEditor>;
