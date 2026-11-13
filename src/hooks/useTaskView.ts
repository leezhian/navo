import { useState } from "react";
import type { Task } from "@/domain/tasks";
import type { TaskDisplayOptions, TaskFilters } from "@/domain/taskView";
import { filterTasks, orderTasks } from "@/utils/taskView";
import { taskProjectNames } from "@/utils/taskProjects";

export function useTaskView(tasks: Task[]) {
  const [filters, setFilters] = useState<TaskFilters>({ statuses: [], projects: [] });
  const [display, setDisplay] = useState<TaskDisplayOptions>({ mode: "board", sortField: "date", sortDirection: "desc", showDate: true, showProject: true });
  const visibleTasks = orderTasks(filterTasks(tasks, filters), display);
  const projectNames = [...new Set(tasks.flatMap(taskProjectNames))].sort((left, right) => left.localeCompare(right));
  const hasFilters = filters.statuses.length > 0 || filters.projects.length > 0;

  function clearFilters() {
    setFilters({ statuses: [], projects: [] });
  }

  return { filters, setFilters, display, setDisplay, visibleTasks, projectNames, hasFilters, clearFilters };
}
