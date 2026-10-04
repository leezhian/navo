import type { IssueGroup, IssueStatus, IssueTag } from "./issues";

export type IssueOrder = "default" | "newest" | "oldest";
export type IssueViewMode = "list" | "board";

export interface IssueFilters {
  /** 同一条件内多选取并集，不同条件之间取交集；空数组表示不限。 */
  groups: IssueGroup[];
  statuses: IssueStatus[];
  projects: string[];
  tags: IssueTag[];
}

export interface IssueDisplayOptions {
  /** 默认列表，面板按 PR 和 ISSUE 分列展示。 */
  mode: IssueViewMode;
  /** 排序仅改变组内展示，不修改原始条目顺序。 */
  order: IssueOrder;
  /** 标签、项目、状态和时间的列表显隐，不影响标题或详情。 */
  showTag: boolean;
  showProject: boolean;
  showStatus: boolean;
  showDate: boolean;
}
