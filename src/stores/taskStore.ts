import { create } from "zustand";
import type { Task, TaskStatus } from "@/domain/tasks";
import type { CreateTaskInput } from "@/shared/taskTypes";
import type { AddTaskResourcesInput } from "@/shared/taskResourceTypes";
import type { TaskDeletionConfirmation } from "@/shared/taskDeletionTypes";
import { getTasksApi } from "@/services/taskApi";
import { clearLegacyTasks, readLegacyTasks } from "@/services/adeData";
import { moveTask } from "@/utils/taskState";

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
  rename: (id: string, title: string) => Promise<boolean>;
  move: (id: string, status: TaskStatus, beforeId: string | null) => Promise<boolean>;
  restore: (id: string) => Promise<boolean>;
  remove: (id: string, confirmation?: TaskDeletionConfirmation) => Promise<boolean>;
}

export const useTaskStore = create<TaskState>((set, get) => {
  async function mutate(operation: () => Promise<Task[]>, optimistic?: Task[]) {
    if (get().pending || get().loading || !get().loaded) return false;
    const previous = get().tasks;
    set({ pending: true, error: null, ...(optimistic ? { tasks: optimistic } : {}) });
    try { set({ tasks: await operation() }); return true; }
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
        set({ tasks, loaded: true, recoveryWarnings: result.recoveryWarnings });
      } catch (error) { set({ error }); }
      finally { set({ loading: false }); }
    },
    requestOpen: (requestedTaskId) => set({ requestedTaskId }),
    async addResources(id, input) {
      if (get().pending || get().loading || !get().loaded) throw new Error("TASK_BUSY");
      set({ pending: true, error: null });
      try {
        const updated = await getTasksApi().addResources(id, input);
        set({ tasks: get().tasks.map((task) => task.id === updated.id ? updated : task) });
        return updated;
      } finally { set({ pending: false }); }
    },
    async create(input) {
      if (get().pending || get().loading || !get().loaded) throw new Error("TASK_BUSY");
      set({ pending: true });
      try {
        const task = await getTasksApi().create(input);
        set({ tasks: [task, ...get().tasks.filter((item) => item.id !== task.id)] });
        return task;
      } finally { set({ pending: false }); }
    },
    rename: (id, title) => mutate(() => getTasksApi().rename(id, title)),
    move: (id, status, beforeId) => mutate(() => getTasksApi().move(id, status, beforeId), moveTask(get().tasks, id, status, beforeId)),
    restore: (id) => mutate(() => getTasksApi().restore(id)),
    remove: (id, confirmation) => mutate(() => getTasksApi().remove(id, confirmation)),
  };
});
