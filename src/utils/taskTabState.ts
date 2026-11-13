import { findTaskSplit } from "../domain/taskSplit";
import type { TaskSplit } from "../domain/taskSplit";

export interface TaskTabSnapshot {
  taskIds: string[];
  activeTaskId: string | null;
  splits: TaskSplit[];
}

/** 删除或关闭页面后，优先保留同一组合的另一页，再按相邻标签回退。 */
export function retainTaskTabs(state: TaskTabSnapshot, existingIds: string[]) {
  const taskIds = state.taskIds.filter((id) => existingIds.includes(id));
  if (taskIds.length === state.taskIds.length) return state;
  const splits = state.splits.filter((split) => taskIds.includes(split.firstTaskId) && (!split.secondTaskId || taskIds.includes(split.secondTaskId)));
  let activeTaskId = state.activeTaskId;
  if (activeTaskId && !taskIds.includes(activeTaskId)) {
    const partner = findTaskSplit(state.splits, activeTaskId);
    const survivingPartner = [partner?.firstTaskId, partner?.secondTaskId].find((id) => id && taskIds.includes(id));
    const index = state.taskIds.indexOf(activeTaskId);
    activeTaskId = survivingPartner
      ?? state.taskIds.slice(index + 1).find((id) => taskIds.includes(id))
      ?? state.taskIds.slice(0, index).reverse().find((id) => taskIds.includes(id))
      ?? null;
  }
  return { taskIds, splits, activeTaskId };
}

/** 把参与组合的第二页移动到第一页面后，避免页签重复或散落。 */
export function joinTaskOrder(taskIds: string[], firstTaskId: string, secondTaskId: string) {
  return taskIds.filter((id) => id !== secondTaskId).flatMap((id) => id === firstTaskId ? [id, secondTaskId] : [id]);
}
