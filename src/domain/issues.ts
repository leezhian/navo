export type IssueGroup = "PR" | "ISSUE";
export type IssueStatus = "review" | "merged" | "draft" | "todo" | "progress" | "closed";
export type IssueTag = "feature" | "fix" | "refactor" | "discussion";
export type IssueSource = "local" | "remote";
export type IssueAuthorKind = "mine" | "review";
export type IssueCheckState = "failing" | "pending" | "passing";
export type IssueMergeState = "clean" | "conflict" | "blocked";

export interface IssuePerson {
  login: string;
  name?: string;
  avatarUrl?: string;
}

export interface IssueLabel {
  name: string;
  color?: string;
}

export interface IssueComment {
  id: string;
  author?: IssuePerson;
  body: string;
  createdAt: string;
}

export interface IssueCheckSummary {
  state: IssueCheckState;
}

export interface IssueItem {
  /** 条目的唯一标识，不在列表内额外展示编号。 */
  id: string;
  /** 条目所属的 PR 或 ISSUE 分组。 */
  group: IssueGroup;
  /** 旧的本地分类标签；远端条目改用 labels。 */
  tag?: IssueTag;
  /** 标题前展示的平台标签。 */
  labels?: IssueLabel[];
  /** 左侧展示的标题，空间不足时省略并提供完整提示。 */
  title: string;
  /** 右侧展示的所属项目。 */
  projectName: string;
  /** 服务商显示名称，例如 GitHub；旧数据未提供时不推断来源。 */
  provider?: string;
  providerId?: import("../shared/integrationTypes").IntegrationProviderId;
  host?: string;
  /** 来源仓库标识或全名，旧条目沿用项目名作为仓库筛选值。 */
  repository?: string;
  url?: string;
  /** 按平台习惯展示的编号，如 #123、!45、ENG-12。 */
  number?: string;
  numberValue?: number;
  /** 根据条目类型展示相应的状态文案，通过文字颜色区分。 */
  status: IssueStatus;
  /** 平台原始状态名，仅详情展示。 */
  nativeStatus?: string;
  /** 条目更新时间，预览以 ISO 日期存储。 */
  date: string;
  body?: string;
  author?: IssuePerson;
  authorKind?: IssueAuthorKind;
  assignees?: IssuePerson[];
  milestone?: string;
  commentCount?: number;
  comments?: IssueComment[];
  commentsHasEarlier?: boolean;
  commentsPage?: number;
  checks?: IssueCheckSummary;
  mergeState?: IssueMergeState;
  reviewApproved?: boolean;
  headBranch?: string;
  baseBranch?: string;
  isFork?: boolean;
  mentionedOnly?: boolean;
  autoLinked?: boolean;
  lastFetchedAt?: string;
  fetchError?: string;
  source?: IssueSource;
  /** 清理归档时间；活动列表中的条目不带该字段。 */
  archivedAt?: string;
}

export function issueLabelNames(issue: IssueItem): string[] {
  if (issue.labels?.length) return issue.labels.map((item) => item.name);
  return issue.tag ? [issue.tag] : [];
}
