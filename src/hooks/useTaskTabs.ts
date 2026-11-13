import { useEffect } from "react";
import { useTaskStore } from "@/stores/taskStore";
import { useTaskTabsStore } from "@/stores/taskTabsStore";
import { findTaskSplit, taskTabGroups } from "@/domain/taskSplit";

/** 标签仅保存任务标识，标题及详情始终读取同一份任务数据。 */
export function useTaskTabs() {
  const workspace = useTaskTabsStore();
  const tasks = useTaskStore((state) => state.tasks);
  const loaded = useTaskStore((state) => state.loaded);

  useEffect(() => {
    if (loaded) workspace.retainTasks(tasks.map((task) => task.id));
  }, [loaded, tasks, workspace.retainTasks]);

  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const tabs = workspace.taskIds.flatMap((id) => {
    const task = taskMap.get(id);
    return task ? [task] : [];
  });
  return { ...workspace, tabs, taskMap, groups: taskTabGroups(workspace.taskIds, workspace.splits), activeSplit: findTaskSplit(workspace.splits, workspace.activeTaskId) };
}
