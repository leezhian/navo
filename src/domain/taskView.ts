import type { TaskStatus } from "./tasks";

export type TaskViewMode = "board" | "list";
export type TaskOrder = "manual" | "newest" | "oldest";

export interface TaskFilters {
  /** 未选择时匹配所有状态，同类条件之间取并集。 */
  statuses: TaskStatus[];
  /** 未选择时匹配所有项目，与状态条件取交集。 */
  projects: string[];
}

export interface TaskDisplayOptions {
  /** 看板或按状态分组的列表。 */
  mode: TaskViewMode;
  /** 自定义顺序支持拖拽；日期排序只改变显示，不覆盖任务顺序。 */
  order: TaskOrder;
  /** 控制卡片和列表中的日期、项目字段，不影响详情。 */
  showDate: boolean;
  showProject: boolean;
}
