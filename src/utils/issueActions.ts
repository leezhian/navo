import type { IssueItem } from "@/domain/issues";

export const ISSUE_AUTO_REFRESH_MS = 60_000;

/** 按实际平台命名「在 X 中打开」；本地条目没有平台时返回 null。 */
export function issuePlatformName(item: IssueItem): string | null {
  if (item.providerId === "github" || item.providerId === "github-enterprise") return "GitHub";
  if (item.providerId === "gitlab" || item.providerId === "gitlab-self-hosted") return "GitLab";
  if (item.providerId === "linear") return "Linear";
  return item.url ? item.provider ?? null : null;
}

export function issueNeedsRefresh(item: IssueItem, now = Date.now()) {
  if (item.source === "local" || !item.providerId) return false;
  if (!item.lastFetchedAt) return true;
  return now - Date.parse(item.lastFetchedAt) > ISSUE_AUTO_REFRESH_MS;
}

export function issueRelativeMinutes(value: string | undefined, now = Date.now()) {
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.floor((now - time) / 60_000));
}

/** 失败原因对应唯一修复动作。 */
export function issueFailureAction(code: string | undefined): "reconnect" | "settings" | "retry" | "none" {
  if (!code) return "none";
  if (code === "unauthorized" || code === "expired" || code === "rejected") return "reconnect";
  if (code === "disconnected") return "settings";
  if (code === "notFound" || code === "forbidden") return "none";
  return "retry";
}

export function isSafeHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; }
}

const LINEAR_ID = /^[A-Z][A-Z0-9]+-\d+$/;

/** 选择器搜索框识别平台链接或 Linear 编号，不把普通网页误判成 Issue。 */
export function looksLikeProviderIssueQuery(value: string) {
  const trimmed = value.trim();
  if (LINEAR_ID.test(trimmed)) return true;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return /\/(issues|pull|merge_requests)\/\d+/i.test(url.pathname) || /\/issue\/[A-Z][A-Z0-9]+-\d+/i.test(url.pathname);
  } catch { return false; }
}
