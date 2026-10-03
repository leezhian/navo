import { useEffect } from "react";
import { useTaskStore } from "@/stores/taskStore";

export function useTasks() {
  const store = useTaskStore();
  useEffect(() => { if (!useTaskStore.getState().loaded) void store.bootstrap(); }, [store.bootstrap]);
  return store;
}
