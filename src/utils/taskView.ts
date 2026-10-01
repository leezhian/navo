import type { Task } from "@/domain/tasks";
import type { TaskFilters, TaskOrder } from "@/domain/taskView";

export function filterTasks(tasks: Task[], filters: TaskFilters): Task[] {
  return tasks.filter((task) => (
    (filters.statuses.length === 0 || filters.statuses.includes(task.status))
    && (filters.projects.length === 0 || filters.projects.includes(task.projectName))
  ));
}

export function orderTasks(tasks: Task[], order: TaskOrder): Task[] {
  if (order === "manual") return tasks;
  const direction = order === "newest" ? -1 : 1;
  return [...tasks].sort((left, right) => direction * (Date.parse(left.date) - Date.parse(right.date)));
}
