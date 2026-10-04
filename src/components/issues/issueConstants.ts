import type { IssueGroup, IssueStatus, IssueTag } from "@/domain/issues";
import type { IssueDisplayOptions } from "@/domain/issueView";

export const issueGroups: IssueGroup[] = ["PR", "ISSUE"];
export const issueStatusOptions: IssueStatus[] = ["review", "merged", "draft", "todo", "progress", "closed"];
export const issueTagOptions: IssueTag[] = ["feature", "fix", "refactor", "discussion"];
export const issueDisplayFields: { key: keyof Omit<IssueDisplayOptions, "order" | "mode">; label: string }[] = [
  { key: "showTag", label: "标签" },
  { key: "showProject", label: "项目" },
  { key: "showStatus", label: "状态" },
  { key: "showDate", label: "时间" },
];

export const issueTags: Record<IssueTag, string> = {
  feature: "功能", fix: "修复", refactor: "重构", discussion: "讨论",
};

export const issueStatuses: Record<IssueStatus, string> = {
  review: "待审查",
  merged: "已合并",
  draft: "草稿",
  todo: "待处理",
  progress: "进行中",
  closed: "已关闭",
};
