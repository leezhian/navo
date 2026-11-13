import type { TaskStatus } from "./tasks";
import type { ViewSortOptions } from "./viewSort";

export type TaskViewMode = "board" | "list";

export interface TaskDropTarget {
  /** 跨组拖拽后的状态。 */
  status: TaskStatus;
}

export interface TaskFilters {
  /** 未选择时匹配所有状态，同类条件之间取并集。 */
  statuses: TaskStatus[];
  /** 未选择时匹配所有项目，与状态条件取交集。 */
  projects: string[];
}

export interface TaskDisplayOptions extends ViewSortOptions {
  /** 看板或按状态分组的列表。 */
  mode: TaskViewMode;
  /** 控制卡片和列表中的日期、项目字段，不影响详情。 */
  showDate: boolean;
  showProject: boolean;
}
