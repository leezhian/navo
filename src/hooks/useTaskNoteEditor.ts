import { useRef, useState } from "react";
import type { Task } from "@/domain/tasks";
import type { TaskNote } from "@/shared/taskResourceTypes";
import { useTaskStore } from "@/stores/taskStore";
import { TASK_PROMPT_ID } from "@/shared/taskContextTypes";
import { useTranslation } from "react-i18next";
import { taskNoteDraftKey, useTaskNoteDraftStore, useTaskNoteDraftStorageStatus } from "@/stores/taskNoteDraftStore";
import { getTasksApi } from "@/services/taskApi";

type NoteConfirmation = { kind: "delete"; note: TaskNote } | { kind: "discard"; proceed: () => void };

export function useTaskNoteEditor(task: Task, noteId: string | undefined, onDeleted: () => void) {
  const { t } = useTranslation(["tasks", "common"]);
  const isPrompt = noteId === TASK_PROMPT_ID;
  const [editingId, setEditingId] = useState<string>();
  const storedDraft = useTaskNoteDraftStore((state) => noteId ? state.drafts[taskNoteDraftKey(task.id, noteId)] : undefined);
  const draft = editingId === noteId ? storedDraft : undefined;
  // 外部删除笔记时仍保留未提交草稿，保存明确报错而不是静默丢弃编辑内容。
  const note: TaskNote | undefined = isPrompt ? { id: TASK_PROMPT_ID, title: t("tasks:context.prompt"), content: task.description ?? "", version: task.promptVersion ?? 1,
    origin: "user", sortOrder: 0, createdAt: task.date, updatedAt: task.date, ...task.promptMetadata, comments: task.promptComments }
    : task.notes?.find((item) => item.id === noteId) ?? storedDraft?.original;
  const [confirmation, setConfirmation] = useState<NoteConfirmation | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const pending = useTaskStore((state) => state.pending);
  const draftStorageFailed = useTaskNoteDraftStorageStatus((state) => state.failed);
  const dirty = Boolean(draft && (draft.title !== draft.original.title || draft.content !== draft.original.content));
  const hasDraft = Boolean(storedDraft && (storedDraft.title !== storedDraft.original.title || storedDraft.content !== storedDraft.original.content));
  const readOnly = task.status === "ARCHIVED";
  const deletionNote = confirmation?.kind === "delete" && task.notes?.some((item) => item.id === confirmation.note.id) ? confirmation.note : undefined;
  const visibleConfirmation = confirmation?.kind === "delete" ? deletionNote ? confirmation : null : note ? confirmation : null;

  function reset() {
    if (noteId) useTaskNoteDraftStore.getState().clear(task.id, noteId);
    setEditingId(undefined); setError(null); setConfirmation(null);
  }
  function leave(proceed: () => void) {
    if (saving.current || visibleConfirmation) return;
    // 离开只收起编辑器，持久化草稿保留；显式取消才丢弃。
    if (storedDraft && !hasDraft && noteId) useTaskNoteDraftStore.getState().clear(task.id, noteId);
    setEditingId(undefined); setError(null); proceed();
  }
  function edit() {
    if (!note || readOnly || saving.current) return;
    if (!storedDraft) useTaskNoteDraftStore.getState().write({ taskId: task.id, original: note, title: note.title, content: note.content });
    setEditingId(note.id);
    setError(null);
  }
  async function save(overwrite = false) {
    if (!draft || !dirty || readOnly || pending || saving.current) return;
    saving.current = true; setBusy(true); setError(null);
    try {
      const latest = overwrite ? (await getTasksApi().load()).tasks?.find((item) => item.id === task.id) : undefined;
      const latestNote = latest?.notes?.find((item) => item.id === noteId);
      const version = overwrite ? isPrompt ? latest?.promptVersion : latest?.notes?.find((item) => item.id === noteId)?.version : draft.original.version;
      if (version === undefined) throw new Error("TASK_NOTE_NOT_FOUND");
      if (isPrompt) await useTaskStore.getState().updatePrompt(task.id, draft.content, overwrite ? latest?.description ?? "" : draft.original.content, version);
      else await useTaskStore.getState().updateNote(task.id, { id: draft.original.id, title: overwrite && draft.title === draft.original.title ? latestNote?.title ?? draft.title : draft.title, content: draft.content }, version);
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
      await useTaskStore.getState().deleteNote(task.id, deletionNote.id, deletionNote.version);
      useTaskNoteDraftStore.getState().clear(task.id, deletionNote.id);
      useTaskNoteDraftStore.getState().clearComment(task.id, deletionNote.id);
      if (deletionNote.id === note?.id) { reset(); onDeleted(); }
      else { setConfirmation(null); setError(null); }
    } catch (failure) { setError(failure); }
    finally { saving.current = false; setBusy(false); }
  }
  return {
    taskId: task.id, note, isPrompt, deletionNote, draft, hasDraft, draftStorageFailed, dirty, error, busy, pending, readOnly, confirmation: visibleConfirmation,
    edit, leave, save, confirm,
    change: (patch: Partial<Pick<TaskNote, "title" | "content">>) => {
      if (draft) useTaskNoteDraftStore.getState().write({ ...draft, ...patch });
    },
    cancel: () => { if (saving.current) return; if (dirty) setConfirmation({ kind: "discard", proceed: () => undefined }); else reset(); },
    requestDelete: (id = note?.id) => {
      const selected = task.notes?.find((item) => item.id === id);
      if (selected && !readOnly && !pending && !saving.current) { setError(null); setConfirmation({ kind: "delete", note: selected }); }
    },
    cancelConfirmation: () => { if (!saving.current) { setConfirmation(null); setError(null); } },
  };
}

export type TaskNoteEditor = ReturnType<typeof useTaskNoteEditor>;
