import type { IssueGroup, IssueItem } from "@/domain/issues";
import type { IssueFilters, IssueOrder } from "@/domain/issueView";

export function filterIssues(issues: IssueItem[], filters: IssueFilters): IssueItem[] {
  return issues.filter((issue) => (
    (filters.groups.length === 0 || filters.groups.includes(issue.group))
    && (filters.statuses.length === 0 || filters.statuses.includes(issue.status))
    && (filters.projects.length === 0 || filters.projects.includes(issue.projectName))
    && (filters.tags.length === 0 || filters.tags.includes(issue.tag))
  ));
}

export function orderIssues(issues: IssueItem[], order: IssueOrder): IssueItem[] {
  if (order === "default") return issues;
  const direction = order === "newest" ? -1 : 1;
  return [...issues].sort((left, right) => direction * (Date.parse(left.date) - Date.parse(right.date)));
}

/** 更新内容及增删结果，已有条目保持手动顺序，新条目追加。 */
export function mergeIssueItems(current: IssueItem[], incoming: IssueItem[]): IssueItem[] {
  const remaining = new Map(incoming.map((item) => [item.id, item]));
  const merged: IssueItem[] = [];
  for (const item of current) {
    const updated = remaining.get(item.id);
    if (updated) merged.push(updated);
    remaining.delete(item.id);
  }
  return [...merged, ...remaining.values()];
}

/** 只调整同类型条目位置，拒绝跨类型目标；筛选隐藏的条目不会丢失。 */
export function moveIssue(issues: IssueItem[], issueId: string, group: IssueGroup, beforeIssueId: string | null): IssueItem[] {
  const issue = issues.find((item) => item.id === issueId);
  if (!issue || issue.group !== group || beforeIssueId === issueId) return issues;
  const before = beforeIssueId === null ? null : issues.find((item) => item.id === beforeIssueId);
  if (beforeIssueId !== null && (!before || before.group !== group)) return issues;
  const remaining = issues.filter((item) => item.id !== issueId);
  const insertionIndex = before ? remaining.findIndex((item) => item.id === before.id) : remaining.length;
  remaining.splice(insertionIndex, 0, issue);
  return remaining;
}
