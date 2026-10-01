import { useState } from "react";
import type { IssueItem } from "@/domain/issues";
import type { IssueDisplayOptions, IssueFilters } from "@/domain/issueView";
import { filterIssues, orderIssues } from "@/utils/issueView";

export function useIssueView(issues: IssueItem[]) {
  const [filters, setFilters] = useState<IssueFilters>({ groups: [], statuses: [], projects: [], tags: [] });
  const [display, setDisplay] = useState<IssueDisplayOptions>({ order: "default", showTag: true, showProject: true, showStatus: true, showDate: true });
  const visibleIssues = orderIssues(filterIssues(issues, filters), display.order);
  const projectNames = [...new Set(issues.map((issue) => issue.projectName))].sort((left, right) => left.localeCompare(right));
  const hasFilters = filters.groups.length > 0 || filters.statuses.length > 0 || filters.projects.length > 0 || filters.tags.length > 0;

  function clearFilters() {
    setFilters({ groups: [], statuses: [], projects: [], tags: [] });
  }

  return { filters, setFilters, display, setDisplay, visibleIssues, projectNames, hasFilters, clearFilters };
}
