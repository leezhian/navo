import { create } from "zustand";
import type { Task, TaskStatus } from "@/domain/tasks";
import type { CreateTaskInput } from "@/shared/taskTypes";
import type { AddTaskResourcesInput, TaskNoteUpdate } from "@/shared/taskResourceTypes";
import type { TaskDeletionConfirmation } from "@/shared/taskDeletionTypes";
import { getTasksApi } from "@/services/taskApi";
import { clearLegacyTasks, readLegacyTasks } from "@/services/adeData";
import { moveTask } from "@/utils/taskState";
import { useTaskNoteDraftStore } from "./taskNoteDraftStore";

interface TaskState {
  tasks: Task[];
  loaded: boolean;
  loading: boolean;
  pending: boolean;
  error: unknown;
  recoveryWarnings: string[];
  requestedTaskId: string | null;
  bootstrap: () => Promise<void>;
  requestOpen: (id: string | null) => void;
  create: (input: CreateTaskInput) => Promise<Task>;
  addResources: (id: string, input: AddTaskResourcesInput) => Promise<Task>;
  updateNote: (id: string, note: TaskNoteUpdate, expectedVersion: number) => Promise<Task>;
  updatePrompt: (id: string, content: string, expected: string, version?: number) => Promise<Task>;
  restoreNote: (id: string, noteId: string, version: number, expected: number) => Promise<Task>;
  commentNote: (id: string, input: import("@/shared/taskNoteTypes").TaskNoteCommentInput) => Promise<Task>;
  changeNoteComment: (id: string, commentId: string, expected: string, patch: { body?: string; resolved?: boolean; remove?: boolean }) => Promise<Task>;
  detachResource: (id: string, input: import("@/shared/taskContextTypes").TaskResourceRemoval) => Promise<Task>;
  deleteWorktree: (id: string, resourceId: string, confirmation: TaskDeletionConfirmation) => Promise<Task>;
  deleteNote: (id: string, noteId: string, expectedVersion: number) => Promise<Task>;
  rename: (id: string, title: string) => Promise<boolean>;
  move: (id: string, status: TaskStatus, beforeId: string | null) => Promise<boolean>;
  restore: (id: string) => Promise<boolean>;
  archive: (id: string, confirmation: TaskDeletionConfirmation) => Promise<boolean>;
  remove: (id: string, confirmation?: TaskDeletionConfirmation) => Promise<boolean>;
}

// IPC 通知可能先于较早的请求响应抵达，不能用旧快照覆盖初始化进度或其他视图的编辑。
const broadcasts = new Map<string, Task>();
function latestTask(task: Task) {
  const latest = broadcasts.get(task.id);
  return latest && (latest.contextVersion ?? 0) >= (task.contextVersion ?? 0) && latest.updatedAt >= task.updatedAt ? latest : task;
}

export const useTaskStore = create<TaskState>((set, get) => {
  async function updateTask(operation: () => Promise<Task>) {
    if (get().pending || get().loading || !get().loaded) throw new Error("TASK_BUSY");
    set({ pending: true, error: null });
    try {
      const updated = latestTask(await operation());
      set({ tasks: get().tasks.map((task) => task.id === updated.id ? updated : task) });
      return updated;
    } finally { set({ pending: false }); }
  }
  async function mutate(operation: () => Promise<Task[]>, optimistic?: Task[]) {
    if (get().pending || get().loading || !get().loaded) return false;
    const previous = get().tasks;
    set({ pending: true, error: null, ...(optimistic ? { tasks: optimistic } : {}) });
    try { set({ tasks: (await operation()).map(latestTask) }); return true; }
    catch (error) { set({ tasks: previous, error }); return false; }
    finally { set({ pending: false }); }
  }

  return {
    tasks: [], loaded: false, loading: false, pending: false, error: null, recoveryWarnings: [], requestedTaskId: null,
    async bootstrap() {
      if (get().loading || get().pending) return;
      set({ loading: true, error: null });
      try {
        const result = await getTasksApi().load();
        const tasks = result.tasks ?? await getTasksApi().importLegacy(readLegacyTasks());
        if (result.tasks === null) clearLegacyTasks();
        set({ tasks: tasks.map(latestTask), loaded: true, recoveryWarnings: result.recoveryWarnings });
      } catch (error) { set({ error }); }
      finally { set({ loading: false }); }
    },
    requestOpen: (requestedTaskId) => set({ requestedTaskId }),
    addResources: (id, input) => updateTask(() => getTasksApi().addResources(id, input)),
    updateNote: (id, note, expectedVersion) => updateTask(() => getTasksApi().updateNote(id, note, expectedVersion)),
    updatePrompt: (id, content, expected, version) => updateTask(() => getTasksApi().updatePrompt(id, content, expected, version)),
    restoreNote: (id, noteId, version, expected) => updateTask(() => getTasksApi().restoreNote(id, noteId, version, expected)),
    commentNote: (id, input) => updateTask(() => getTasksApi().commentNote(id, input)),
    changeNoteComment: (id, commentId, expected, patch) => updateTask(() => getTasksApi().changeNoteComment(id, commentId, expected, patch)),
    detachResource: (id, input) => updateTask(() => getTasksApi().detachResource(id, input)),
    deleteWorktree: (id, resourceId, confirmation) => updateTask(() => getTasksApi().deleteWorktree(id, resourceId, confirmation)),
    deleteNote: (id, noteId, expectedVersion) => updateTask(() => getTasksApi().deleteNote(id, noteId, expectedVersion)),
    async create(input) {
      if (get().pending || get().loading || !get().loaded) throw new Error("TASK_BUSY");
      set({ pending: true });
      try {
        const task = latestTask(await getTasksApi().create(input));
        set({ tasks: [task, ...get().tasks.filter((item) => item.id !== task.id)] });
        return task;
      } finally { set({ pending: false }); }
    },
    rename: (id, title) => mutate(() => getTasksApi().rename(id, title)),
    move: (id, status, beforeId) => mutate(() => getTasksApi().move(id, status, beforeId), moveTask(get().tasks, id, status, beforeId)),
    restore: (id) => mutate(() => getTasksApi().restore(id)),
    archive: (id, confirmation) => mutate(() => getTasksApi().archive(id, confirmation)),
    remove: async (id, confirmation) => {
      const removed = await mutate(() => getTasksApi().remove(id, confirmation));
      if (removed) useTaskNoteDraftStore.getState().clearTask(id);
      return removed;
    },
  };
});

export function subscribeTaskChanges() {
  try {
    return getTasksApi().onChanged((updated) => {
      broadcasts.set(updated.id, updated);
      useTaskStore.setState((state) => ({ tasks: state.tasks.some((task) => task.id === updated.id)
        ? state.tasks.map((task) => task.id === updated.id ? updated : task) : [updated, ...state.tasks] }));
    });
  } catch { return () => undefined; }
}
