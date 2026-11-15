import { create } from "zustand";
import type { TaskResourceBatchResult, TaskResourceSkip } from "@/shared/taskResourceLifecycle";

interface TaskResourceUndoState {
  taskId: string | null;
  expiresAt: string | null;
  skipped: TaskResourceSkip[];
  remember: (taskId: string, result: TaskResourceBatchResult) => void;
  clear: () => void;
}

export const useTaskResourceUndoStore = create<TaskResourceUndoState>((set) => ({
  taskId: null,
  expiresAt: null,
  skipped: [],
  remember: (taskId, result) => set({ taskId, expiresAt: result.undoExpiresAt, skipped: result.skipped }),
  clear: () => set({ taskId: null, expiresAt: null, skipped: [] }),
}));
