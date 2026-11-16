import type { IntegrationProviderId } from "../../../shared/integrationTypes";

export interface ParsedIssueRef {
  provider: IntegrationProviderId;
  host: string;
  repository?: string;
  group: "PR" | "ISSUE";
  number: string;
  url: string;
}

const GITHUB_PATH = /^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)(?:\/|$)/i;
const GITLAB_PATH = /^\/(.+)\/-\/(issues|merge_requests)\/(\d+)(?:\/|$)/i;
const LINEAR_PATH = /^\/(?:[^/]+\/)?issue\/([A-Z][A-Z0-9]+-\d+)/i;
const LINEAR_ID = /^[A-Z][A-Z0-9]+-\d+$/;

export function issueCacheKey(provider: IntegrationProviderId, host: string, repository: string | undefined, group: "PR" | "ISSUE", number: string) {
  return [provider, host.toLowerCase(), repository?.toLowerCase() ?? "", group, number].join(":");
}

export function githubHostFromApi(apiBase: string) {
  try {
    const host = new URL(apiBase).hostname.toLowerCase();
    return host === "api.github.com" ? "github.com" : host;
  } catch { return "github.com"; }
}

export function parseProviderIssueUrl(value: string, connectedHosts: { id: IntegrationProviderId; host: string }[] = []): ParsedIssueRef | null {
  const trimmed = value.trim();
  if (LINEAR_ID.test(trimmed)) {
    return { provider: "linear", host: "linear.app", group: "ISSUE", number: trimmed, url: `https://linear.app/issue/${trimmed}` };
  }
  let parsed: URL;
  try { parsed = new URL(trimmed); } catch { return null; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  const github = GITHUB_PATH.exec(parsed.pathname);
  if (github) {
    const provider: IntegrationProviderId = host === "github.com" ? "github" : "github-enterprise";
    const repository = `${github[1]}/${github[2]}`;
    const group = github[3].toLowerCase() === "pull" ? "PR" : "ISSUE";
    return { provider, host, repository, group, number: github[4], url: `${parsed.protocol}//${parsed.host}/${repository}/${github[3].toLowerCase() === "pull" ? "pull" : "issues"}/${github[4]}` };
  }
  const gitlab = GITLAB_PATH.exec(parsed.pathname);
  if (gitlab) {
    const provider: IntegrationProviderId = host === "gitlab.com" ? "gitlab" : "gitlab-self-hosted";
    const group = gitlab[2].toLowerCase() === "merge_requests" ? "PR" : "ISSUE";
    return { provider, host, repository: gitlab[1], group, number: gitlab[3], url: `${parsed.protocol}//${parsed.host}/${gitlab[1]}/-/${gitlab[2].toLowerCase()}/${gitlab[3]}` };
  }
  const linear = LINEAR_PATH.exec(parsed.pathname);
  if (linear && (host === "linear.app" || connectedHosts.some((item) => item.id === "linear"))) {
    return { provider: "linear", host: "linear.app", group: "ISSUE", number: linear[1], url: `https://linear.app/issue/${linear[1]}` };
  }
  return null;
}

export function looksLikeProviderIssueQuery(value: string) {
  return parseProviderIssueUrl(value) !== null;
}

/** 将 Git 远端规范化为主机 + owner/repo，便于与 PR 源仓库比较。 */
export function normalizeRepoIdentity(remoteOrUrl: string | null | undefined): { host: string; repository: string } | null {
  if (!remoteOrUrl) return null;
  try {
    const raw = remoteOrUrl.trim();
    const scp = !raw.includes("://") && raw.match(/^(?:[^/@:]+@)?([a-zA-Z0-9.-]+):(.+)$/);
    const parsed = new URL(scp ? `ssh://${scp[1]}/${scp[2]}` : raw);
    if (!parsed.hostname) return null;
    const segments = parsed.pathname.replace(/\/+$/, "").replace(/\.git$/, "").split("/").filter(Boolean).map(decodeURIComponent);
    if (segments.length < 2) return null;
    const repository = segments.slice(-2).join("/").toLowerCase();
    return { host: parsed.hostname.toLowerCase(), repository };
  } catch { return null; }
}

export function sameRepository(left: { host: string; repository: string } | null, right: { host: string; repository: string } | null) {
  return !!left && !!right && left.host === right.host && left.repository === right.repository;
}
