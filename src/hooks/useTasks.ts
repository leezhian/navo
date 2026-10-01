import { useEffect, useState } from "react";
import { loadTasks, saveTasks } from "@/services/adeData";

export function useTasks() {
  const [tasks, setTasks] = useState(loadTasks);
  useEffect(() => saveTasks(tasks), [tasks]);
  return { tasks, setTasks };
}
