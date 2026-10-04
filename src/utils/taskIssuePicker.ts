import type { IssueItem } from "../domain/issues";
import type { Task } from "../domain/tasks";

export type TaskLinkFilter = "any" | "linked" | "unlinked";
export type PullRequestStateFilter = "any" | "open" | "draft";

export interface TaskIssueFilters {
  /** 标题、项目和仓库搜索词。 */
  keyword: string;
  /** 空字符串表示不限，不虚构旧数据的服务商。 */
  provider: string;
  repository: string;
  /** 是否被已保存任务关联，不包含当前未提交草稿。 */
  taskLink: TaskLinkFilter;
  /** 仅 PR 生效；当前数据的 review 对应非草稿 Open，draft 对应 Draft。 */
  prState: PullRequestStateFilter;
}

export function issueRepository(item: IssueItem): string {
  return item.repository ?? item.projectName;
}

export function issueLinkKey(item: IssueItem): string {
  return JSON.stringify([item.group, item.id]);
}

/** 已完成和归档任务仍是存在的关联，删除任务后自然不再计入。 */
export function linkedIssueKeys(tasks: Task[]): Set<string> {
  return new Set(tasks.flatMap((task) => (task.links ?? []).map(issueLinkKey)));
}

export function filterTaskIssues(items: IssueItem[], filters: TaskIssueFilters, linked: Set<string>): IssueItem[] {
  const keyword = filters.keyword.trim().toLowerCase();
  return items.filter((item) => {
    const hasTask = linked.has(issueLinkKey(item));
    return (!filters.provider || item.provider === filters.provider)
      && (!filters.repository || issueRepository(item) === filters.repository)
      && (filters.taskLink === "any" || (filters.taskLink === "linked" ? hasTask : !hasTask))
      && (item.group !== "PR" || filters.prState === "any" || item.status === (filters.prState === "open" ? "review" : "draft"))
      && (item.title + " " + item.projectName + " " + issueRepository(item)).toLowerCase().includes(keyword);
  });
}
