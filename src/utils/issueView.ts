import type { IssueItem } from "@/domain/issues";
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
