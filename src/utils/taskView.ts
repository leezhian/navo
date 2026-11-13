import type { Task, TaskStatus } from "@/domain/tasks";
import type { TaskDropTarget, TaskFilters } from "@/domain/taskView";
import type { ViewSortOptions } from "@/domain/viewSort";
import { taskProjectLabel, taskProjectNames } from "./taskProjects";
import { compareViewValues } from "./viewSort";

export function filterTasks(tasks: Task[], filters: TaskFilters): Task[] {
  return tasks.filter((task) => (
    (filters.statuses.length === 0 || filters.statuses.includes(task.status))
    && (filters.projects.length === 0 || taskProjectNames(task).some((name) => filters.projects.includes(name)))
  ));
}

export function orderTasks(tasks: Task[], { sortField, sortDirection }: ViewSortOptions): Task[] {
  const value = (task: Task) => sortField === "date" ? Date.parse(task.date) : sortField === "title" ? task.title : taskProjectLabel(task);
  return [...tasks].sort((left, right) => compareViewValues(value(left), value(right), sortDirection, left.id, right.id));
}

/** 只验证目标状态，不计算插入位置；同状态或已不存在的任务不是有效落点。 */
export function getTaskStatusDropTarget(tasks: Task[], taskId: string, status: TaskStatus): TaskDropTarget | null {
  const task = tasks.find((item) => item.id === taskId);
  if (!task || task.status === status) return null;
  return { status };
}
