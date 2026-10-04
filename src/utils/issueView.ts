import type { IssueItem } from "@/domain/issues";
import type { IssueFilters } from "@/domain/issueView";
import type { ViewSortOptions } from "@/domain/viewSort";
import { compareViewValues } from "./viewSort";

export function filterIssues(issues: IssueItem[], filters: IssueFilters): IssueItem[] {
  return issues.filter((issue) => (
    (filters.groups.length === 0 || filters.groups.includes(issue.group))
    && (filters.statuses.length === 0 || filters.statuses.includes(issue.status))
    && (filters.projects.length === 0 || filters.projects.includes(issue.projectName))
    && (filters.tags.length === 0 || filters.tags.includes(issue.tag))
  ));
}

export function orderIssues(issues: IssueItem[], { sortField, sortDirection }: ViewSortOptions): IssueItem[] {
  const value = (issue: IssueItem) => sortField === "date" ? Date.parse(issue.date) : sortField === "title" ? issue.title : issue.projectName;
  return [...issues].sort((left, right) => compareViewValues(value(left), value(right), sortDirection, left.id, right.id));
}
