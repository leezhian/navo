import type { Task } from "@/domain/tasks";

export function taskProjectNames(task: Task): string[] {
  return task.resources?.length ? task.resources.map((resource) => resource.name) : task.projectName ? [task.projectName] : [];
}

export function taskProjectLabel(task: Task): string {
  const names = taskProjectNames(task);
  return names.length > 1 ? names[0] + " +" + (names.length - 1) : names[0] ?? "";
}
