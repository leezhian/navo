import type { IssueStatus } from "../../../domain/issues";

export function mapGithubIssueStatus(state: string, draft?: boolean, merged?: boolean): IssueStatus {
  if (merged || state === "merged") return "merged";
  if (draft) return "draft";
  if (state === "closed") return "closed";
  return "review";
}

export function mapGithubIssueItemStatus(state: string): IssueStatus {
  return state === "closed" ? "closed" : "todo";
}

export function mapGitlabIssueStatus(state: string): IssueStatus {
  return state === "closed" ? "closed" : "todo";
}

export function mapGitlabMergeStatus(state: string, draft?: boolean): IssueStatus {
  if (state === "merged") return "merged";
  if (draft) return "draft";
  if (state === "closed") return "closed";
  return "review";
}

export function mapLinearIssueStatus(type: string | undefined, name: string | undefined): IssueStatus {
  const key = `${type ?? ""} ${name ?? ""}`.toLowerCase();
  if (/\b(completed|done|canceled|cancelled)\b/.test(key)) return "closed";
  if (/\b(started|in progress|started)\b/.test(key) || type === "started") return "progress";
  return "todo";
}

export function isOpenIssueStatus(status: IssueStatus) {
  return status !== "closed" && status !== "merged";
}
