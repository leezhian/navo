import type { IssueGroup, IssueStatus, IssueTag } from "@/domain/issues";
import type { IssueDisplayOptions } from "@/domain/issueView";
import type { TranslationKey } from "@/i18n/types";

export const issueGroups: IssueGroup[] = ["PR", "ISSUE"];
export const issueStatusOptions: IssueStatus[] = ["review", "merged", "draft", "todo", "progress", "closed"];
export const issueTagOptions: IssueTag[] = ["feature", "fix", "refactor", "discussion"];
export const issueDisplayFields: { key: keyof Pick<IssueDisplayOptions, "showTag" | "showProject" | "showStatus" | "showDate">; label: TranslationKey<"common"> }[] = [
  { key: "showTag", label: "common:fields.tag" },
  { key: "showProject", label: "common:fields.project" },
  { key: "showStatus", label: "common:fields.status" },
  { key: "showDate", label: "common:fields.time" },
];

export const issueTags: Record<IssueTag, TranslationKey<"issues">> = {
  feature: "issues:tags.feature", fix: "issues:tags.fix", refactor: "issues:tags.refactor", discussion: "issues:tags.discussion",
};

export const issueStatuses: Record<IssueStatus, TranslationKey<"issues">> = {
  review: "issues:statuses.review",
  merged: "issues:statuses.merged",
  draft: "issues:statuses.draft",
  todo: "issues:statuses.todo",
  progress: "issues:statuses.progress",
  closed: "issues:statuses.closed",
};
