export type SplitOrientation = "horizontal" | "vertical";
export type SplitSide = "first" | "second";

export interface TaskSplit {
  id: string;
  firstTaskId: string;
  /** null 表示第二个视图正在选择已有标签，不是新任务。 */
  secondTaskId: string | null;
  orientation: SplitOrientation;
  ratios: Record<SplitOrientation, number>;
}

export interface TaskTabGroup {
  id: string;
  taskIds: string[];
  split: TaskSplit | null;
}

export function findTaskSplit(splits: TaskSplit[], taskId: string | null) {
  return taskId ? splits.find((split) => split.firstTaskId === taskId || split.secondTaskId === taskId) : undefined;
}

export function taskTabGroups(taskIds: string[], splits: TaskSplit[]): TaskTabGroup[] {
  const seen = new Set<string>();
  return taskIds.flatMap<TaskTabGroup>((taskId) => {
    const split = findTaskSplit(splits, taskId);
    if (!split) return [{ id: taskId, taskIds: [taskId], split: null }];
    if (seen.has(split.id)) return [];
    seen.add(split.id);
    return [{ id: split.id, taskIds: [split.firstTaskId, ...(split.secondTaskId ? [split.secondTaskId] : [])], split }];
  });
}
