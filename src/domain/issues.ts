export type IssueGroup = "PR" | "ISSUE";
export type IssueStatus = "review" | "merged" | "draft" | "todo" | "progress" | "closed";
export type IssueTag = "feature" | "fix" | "refactor" | "discussion";

export interface IssueItem {
  /** 条目的唯一标识，不在列表内额外展示编号。 */
  id: string;
  /** 条目所属的 PR 或 ISSUE 分组。 */
  group: IssueGroup;
  /** 标题前展示的业务分类标签。 */
  tag: IssueTag;
  /** 左侧展示的标题，空间不足时省略并提供完整提示。 */
  title: string;
  /** 右侧展示的所属项目。 */
  projectName: string;
  /** 服务商显示名称，例如 GitHub；旧数据未提供时不推断来源。 */
  provider?: string;
  /** 来源仓库标识或全名，旧条目沿用项目名作为仓库筛选值。 */
  repository?: string;
  /** 根据条目类型展示相应的状态文案，通过文字颜色区分。 */
  status: IssueStatus;
  /** 条目更新时间，预览以 ISO 日期存储。 */
  date: string;
}
