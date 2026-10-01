import { useState } from "react";
import type { Task } from "@/domain/tasks";
import type { TaskDisplayOptions, TaskFilters } from "@/domain/taskView";
import { filterTasks, orderTasks } from "@/utils/taskView";

export function useTaskView(tasks: Task[]) {
  const [filters, setFilters] = useState<TaskFilters>({ statuses: [], projects: [] });
  const [display, setDisplay] = useState<TaskDisplayOptions>({ mode: "board", order: "manual", showDate: true, showProject: true });
  const visibleTasks = orderTasks(filterTasks(tasks, filters), display.order);
  const projectNames = [...new Set(tasks.map((task) => task.projectName))].sort((left, right) => left.localeCompare(right));
  const hasFilters = filters.statuses.length > 0 || filters.projects.length > 0;

  function clearFilters() {
    setFilters({ statuses: [], projects: [] });
  }

  return { filters, setFilters, display, setDisplay, visibleTasks, projectNames, hasFilters, clearFilters };
}
