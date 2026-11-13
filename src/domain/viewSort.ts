export type ViewSortField = "date" | "title" | "project";
export type ViewSortDirection = "asc" | "desc";

export interface ViewSortOptions {
  /** 仅使用现有数据中的日期、标题或项目名排序。 */
  sortField: ViewSortField;
  /** 属性排序方向；不改变分组顺序。 */
  sortDirection: ViewSortDirection;
}
