import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { TaskNote } from "@/shared/taskResourceTypes";
import { TASK_NOTE_CONTENT_LIMIT, TASK_NOTE_TITLE_LIMIT } from "@/utils/taskNotes";
import type { TaskNoteCommentInput } from "@/shared/taskNoteTypes";

export interface TaskNoteDraft {
  /** 以任务和笔记共同定位，避免普通笔记与固定正文入口相互覆盖。 */
  taskId: string;
  /** 保留开始编辑时的版本与原文，恢复草稿后仍能检查并发修改。 */
  original: TaskNote;
  title: string;
  content: string;
}

interface TaskNoteDraftState {
  drafts: Record<string, TaskNoteDraft>;
  commentDrafts: Record<string, TaskNoteCommentInput>;
  write: (draft: TaskNoteDraft) => void;
  clear: (taskId: string, noteId: string) => void;
  clearTask: (taskId: string) => void;
  writeComment: (taskId: string, draft: TaskNoteCommentInput) => void;
  clearComment: (taskId: string, noteId: string) => void;
}

export function taskNoteDraftKey(taskId: string, noteId: string) { return JSON.stringify([taskId, noteId]); }
export const useTaskNoteDraftStorageStatus = create(() => ({ failed: false }));

function storageFailed(failed: boolean) {
  if (useTaskNoteDraftStorageStatus.getState().failed !== failed) useTaskNoteDraftStorageStatus.setState({ failed });
}

function restoreDrafts(value: unknown): Record<string, TaskNoteDraft> {
  if (!value || typeof value !== "object" || !("drafts" in value) || !value.drafts || typeof value.drafts !== "object") return {};
  const drafts: Record<string, TaskNoteDraft> = {};
  for (const entry of Object.values(value.drafts)) {
    if (!entry || typeof entry !== "object") continue;
    const draft = entry as TaskNoteDraft;
    if (typeof draft.taskId !== "string" || !draft.original || typeof draft.original.id !== "string"
      || typeof draft.original.title !== "string" || typeof draft.original.content !== "string"
      || !Number.isSafeInteger(draft.original.version) || draft.original.version < 1
      || typeof draft.title !== "string" || draft.title.length > TASK_NOTE_TITLE_LIMIT
      || typeof draft.content !== "string" || draft.content.length > TASK_NOTE_CONTENT_LIMIT) continue;
    drafts[taskNoteDraftKey(draft.taskId, draft.original.id)] = draft;
  }
  return drafts;
}

function restoreComments(value: unknown): Record<string, TaskNoteCommentInput> {
  if (!value || typeof value !== "object" || !("commentDrafts" in value) || !value.commentDrafts || typeof value.commentDrafts !== "object") return {};
  return Object.fromEntries(Object.entries(value.commentDrafts).filter(([, draft]) => draft && typeof draft.id === "string" && typeof draft.noteId === "string"
    && typeof draft.body === "string" && draft.body.length <= 10000 && typeof draft.quote === "string" && draft.quote.length <= TASK_NOTE_CONTENT_LIMIT
    && Number.isSafeInteger(draft.noteVersion) && draft.noteVersion > 0 && Number.isSafeInteger(draft.startLine) && draft.startLine >= 1
    && Number.isSafeInteger(draft.endLine) && draft.endLine >= draft.startLine));
}

/** 草稿独立于已保存任务数据；切换笔记、关闭面板和重启后可继续编辑。 */
export const useTaskNoteDraftStore = create<TaskNoteDraftState>()(persist((set) => ({
  drafts: {},
  commentDrafts: {},
  writeComment: (taskId, draft) => set((state) => ({ commentDrafts: { ...state.commentDrafts, [taskNoteDraftKey(taskId, draft.noteId)]: draft } })),
  clearComment: (taskId, noteId) => set((state) => { const commentDrafts = { ...state.commentDrafts }; delete commentDrafts[taskNoteDraftKey(taskId, noteId)]; return { commentDrafts }; }),
  // 评论来自已保存数据，不复制进正文草稿，避免长线程重复占用本机存储。
  write: (draft) => set((state) => ({ drafts: { ...state.drafts, [taskNoteDraftKey(draft.taskId, draft.original.id)]: { ...draft, original: { ...draft.original, comments: undefined } } } })),
  clear: (taskId, noteId) => set((state) => {
    const drafts = { ...state.drafts }; delete drafts[taskNoteDraftKey(taskId, noteId)]; return { drafts };
  }),
  clearTask: (taskId) => set((state) => {
    const prefix = `[${JSON.stringify(taskId)},`;
    return { drafts: Object.fromEntries(Object.entries(state.drafts).filter(([key]) => !key.startsWith(prefix))),
      commentDrafts: Object.fromEntries(Object.entries(state.commentDrafts).filter(([key]) => !key.startsWith(prefix))) };
  }),
}), {
  name: "navo:task-note-drafts",
  partialize: (state) => ({ drafts: state.drafts, commentDrafts: state.commentDrafts }),
  merge: (persisted, current) => ({ ...current, drafts: restoreDrafts(persisted), commentDrafts: restoreComments(persisted) }),
  storage: createJSONStorage(() => ({
    getItem: (name) => { try { return localStorage.getItem(name); } catch { return null; } },
    setItem: (name, value) => { try { localStorage.setItem(name, value); storageFailed(false); } catch { storageFailed(true); } },
    removeItem: (name) => { try { localStorage.removeItem(name); } catch { /* 不阻断笔记交互。 */ } },
  })),
}));
