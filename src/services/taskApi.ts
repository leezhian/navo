import type { TasksApi } from "@/shared/taskTypes";
import { isDesktop } from "./settingsApi";

export function getTasksApi(): TasksApi {
  if (!isDesktop()) throw new Error("DESKTOP_REQUIRED");
  return window.navo.tasks;
}
