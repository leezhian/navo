import type { IssueComment, IssueItem, IssuePerson } from "../../../domain/issues";
import type { IntegrationAccount } from "../../../shared/integrationTypes";
import { joinApiPath } from "./instanceUrl";
import { issueCacheKey } from "./issueIdentity";
import { providerFetch, readJson, ProviderHttpError } from "./httpClient";
import { logProviderFetchFailure } from "./providerLog";
import type { ProviderFetch } from "./httpClient";
import { mapGitlabIssueStatus, mapGitlabMergeStatus } from "./statusMapping";

export interface GitlabConnection {
  token: string;
  apiBase: string; // https://gitlab.com/api/v4
  host: string;
  provider: "gitlab" | "gitlab-self-hosted";
}

function header(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export function gitlabApiBase(instanceUrl?: string) {
  const base = instanceUrl?.replace(/\/+$/, "") || "https://gitlab.com";
  return joinApiPath(base, "api/v4");
}

export function gitlabHost(instanceUrl?: string) {
  try { return new URL(instanceUrl || "https://gitlab.com").hostname.toLowerCase(); }
  catch { return "gitlab.com"; }
}

function person(value: { username?: string; name?: string; avatar_url?: string } | null | undefined): IssuePerson | undefined {
  if (!value?.username) return undefined;
  return { login: value.username, name: value.name, avatarUrl: value.avatar_url };
}

export async function gitlabViewer(fetchImpl: ProviderFetch, connection: GitlabConnection) {
  const response = await providerFetch(fetchImpl, joinApiPath(connection.apiBase, "user"), { headers: header(connection.token) });
  if (!response.ok) throw new ProviderHttpError(response.status === 401 ? "unauthorized" : "rejected", undefined, response.status);
  const data = await readJson<{ username?: string; name?: string; avatar_url?: string }>(response);
  if (!data.username) throw new ProviderHttpError("unreadable");
  const account: IntegrationAccount = { login: data.username, name: data.name, avatarUrl: data.avatar_url };
  return { account, scopes: [] as string[] };
}

async function collect(fetchImpl: ProviderFetch, connection: GitlabConnection, path: string) {
  const items: Record<string, unknown>[] = [];
  for (let page = 1; page <= 4; page += 1) {
    const response = await providerFetch(fetchImpl, `${joinApiPath(connection.apiBase, path)}${path.includes("?") ? "&" : "?"}per_page=50&page=${page}`, { headers: header(connection.token) });
    if (!response.ok) {
      logProviderFetchFailure({ provider: connection.provider, status: response.status });
      throw new ProviderHttpError(response.status === 401 ? "unauthorized" : "unreadable", undefined, response.status);
    }
    const data = await readJson<Record<string, unknown>[]>(response);
    items.push(...data);
    if (data.length < 50) break;
  }
  return items;
}

function mapIssue(data: Record<string, unknown>, connection: GitlabConnection): IssueItem {
  const number = String(data.iid ?? "");
  const project = String(data.references && (data.references as { full?: string }).full ? String((data.references as { full?: string }).full).split("#")[0] : data.web_url ? gitlabProjectFromUrl(String(data.web_url), "issues") : "");
  const labels = (Array.isArray(data.labels) ? data.labels : []).flatMap((item) => typeof item === "string" ? [{ name: item }] : typeof item === "object" && item && "name" in item ? [{ name: String((item as { name: string }).name) }] : []);
  return {
    id: issueCacheKey(connection.provider, connection.host, project, "ISSUE", number),
    group: "ISSUE",
    title: String(data.title ?? ""),
    projectName: project,
    provider: "GitLab",
    providerId: connection.provider,
    host: connection.host,
    repository: project,
    url: String(data.web_url ?? ""),
    number: `#${number}`,
    numberValue: Number(number),
    status: mapGitlabIssueStatus(String(data.state ?? "")),
    nativeStatus: String(data.state ?? ""),
    date: String(data.updated_at ?? data.created_at ?? new Date().toISOString()),
    body: typeof data.description === "string" ? data.description : undefined,
    author: person(data.author as { username?: string; name?: string; avatar_url?: string } | undefined),
    assignees: ((data.assignees as { username?: string; name?: string; avatar_url?: string }[] | undefined) ?? []).flatMap((item) => person(item) ? [person(item)!] : []),
    labels,
    milestone: (data.milestone as { title?: string } | undefined)?.title,
    commentCount: typeof data.user_notes_count === "number" ? data.user_notes_count : undefined,
    lastFetchedAt: new Date().toISOString(),
    source: "remote",
  };
}

function mapMergeRequest(data: Record<string, unknown>, connection: GitlabConnection, login: string): IssueItem {
  const number = String(data.iid ?? "");
  const project = String(data.references && (data.references as { full?: string }).full ? String((data.references as { full?: string }).full).split("!")[0] : data.web_url ? gitlabProjectFromUrl(String(data.web_url), "merge_requests") : "");
  const labels = (Array.isArray(data.labels) ? data.labels : []).flatMap((item) => typeof item === "string" ? [{ name: item }] : []);
  const author = person(data.author as { username?: string; name?: string; avatar_url?: string } | undefined);
  const draft = data.draft === true || data.work_in_progress === true;
  return {
    id: issueCacheKey(connection.provider, connection.host, project, "PR", number),
    group: "PR",
    title: String(data.title ?? ""),
    projectName: project,
    provider: "GitLab",
    providerId: connection.provider,
    host: connection.host,
    repository: project,
    url: String(data.web_url ?? ""),
    number: `!${number}`,
    numberValue: Number(number),
    status: mapGitlabMergeStatus(String(data.state ?? ""), draft),
    nativeStatus: draft ? "Draft" : String(data.state ?? ""),
    date: String(data.updated_at ?? data.created_at ?? new Date().toISOString()),
    body: typeof data.description === "string" ? data.description : undefined,
    author,
    authorKind: author?.login === login ? "mine" : "review",
    assignees: ((data.assignees as { username?: string; name?: string; avatar_url?: string }[] | undefined) ?? []).flatMap((item) => person(item) ? [person(item)!] : []),
    labels,
    headBranch: typeof data.source_branch === "string" ? data.source_branch : undefined,
    baseBranch: typeof data.target_branch === "string" ? data.target_branch : undefined,
    isFork: Boolean(data.source_project_id && data.target_project_id && data.source_project_id !== data.target_project_id),
    mergeState: data.has_conflicts === true ? "conflict" : data.merge_status === "can_be_merged" ? "clean" : data.merge_status ? "blocked" : undefined,
    reviewApproved: Array.isArray(data.reviewers) ? undefined : undefined,
    lastFetchedAt: new Date().toISOString(),
    source: "remote",
  };
}

function gitlabProjectFromUrl(url: string, kind: "issues" | "merge_requests") {
  try {
    const parsed = new URL(url);
    const marker = `/-/${kind}/`;
    const index = parsed.pathname.indexOf(marker);
    return (index >= 0 ? parsed.pathname.slice(1, index) : parsed.pathname.replace(/^\//, "")).replace(/\/+$/, "");
  } catch { return ""; }
}

export async function listGitlabMine(fetchImpl: ProviderFetch, connection: GitlabConnection, login: string): Promise<IssueItem[]> {
  const [createdIssues, assignedIssues, createdMrs, reviewedMrs] = await Promise.all([
    collect(fetchImpl, connection, "issues?state=opened&scope=created_by_me"),
    collect(fetchImpl, connection, "issues?state=opened&scope=assigned_to_me"),
    collect(fetchImpl, connection, "merge_requests?state=opened&scope=created_by_me"),
    collect(fetchImpl, connection, "merge_requests?state=opened&scope=all&reviewer_username=" + encodeURIComponent(login)),
  ]);
  const items: IssueItem[] = [];
  const seen = new Set<string>();
  for (const row of [...createdIssues, ...assignedIssues]) {
    const item = mapIssue(row, connection);
    if (!seen.has(item.id)) { seen.add(item.id); items.push(item); }
  }
  for (const row of [...createdMrs, ...reviewedMrs]) {
    const item = mapMergeRequest(row, connection, login);
    if (!seen.has(item.id)) { seen.add(item.id); items.push(item); }
  }
  return items;
}

export async function getGitlabItem(fetchImpl: ProviderFetch, connection: GitlabConnection, repository: string, group: "PR" | "ISSUE", number: string, login: string) {
  const project = encodeURIComponent(repository);
  const path = group === "PR" ? `projects/${project}/merge_requests/${number}` : `projects/${project}/issues/${number}`;
  const response = await providerFetch(fetchImpl, joinApiPath(connection.apiBase, path), { headers: header(connection.token) });
  if (!response.ok) {
    logProviderFetchFailure({ provider: connection.provider, status: response.status });
    throw new ProviderHttpError(response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 404 ? "notFound" : "unreadable", undefined, response.status);
  }
  const data = await readJson<Record<string, unknown>>(response);
  return group === "PR" ? mapMergeRequest(data, connection, login) : mapIssue(data, connection);
}

export async function listGitlabComments(fetchImpl: ProviderFetch, connection: GitlabConnection, repository: string, group: "PR" | "ISSUE", number: string, page = 1): Promise<{ comments: IssueComment[]; hasEarlier: boolean }> {
  const project = encodeURIComponent(repository);
  const kind = group === "PR" ? "merge_requests" : "issues";
  const response = await providerFetch(fetchImpl, `${joinApiPath(connection.apiBase, `projects/${project}/${kind}/${number}/notes`)}?per_page=100&page=${page}&sort=asc`, { headers: header(connection.token) });
  if (!response.ok) {
    logProviderFetchFailure({ provider: connection.provider, status: response.status });
    throw new ProviderHttpError(response.status === 401 ? "unauthorized" : "unreadable", undefined, response.status);
  }
  const data = await readJson<{ id: number; body?: string; created_at?: string; system?: boolean; author?: { username?: string; name?: string; avatar_url?: string } }[]>(response);
  const comments: IssueComment[] = data.filter((item) => !item.system).map((item) => ({
    id: String(item.id),
    author: person(item.author),
    body: item.body ?? "",
    createdAt: item.created_at ?? new Date().toISOString(),
  }));
  const link = response.headers.get("link") ?? "";
  return { comments, hasEarlier: page > 1 || /rel="next"/.test(link) };
}

export async function listGitlabMergeRequestsForBranch(fetchImpl: ProviderFetch, connection: GitlabConnection, repository: string, branch: string, login: string) {
  const project = encodeURIComponent(repository);
  const response = await providerFetch(fetchImpl, `${joinApiPath(connection.apiBase, `projects/${project}/merge_requests`)}?state=opened&source_branch=${encodeURIComponent(branch)}`, { headers: header(connection.token) });
  if (!response.ok) {
    logProviderFetchFailure({ provider: connection.provider, status: response.status });
    throw new ProviderHttpError(response.status === 401 ? "unauthorized" : "unreadable", undefined, response.status);
  }
  const data = await readJson<Record<string, unknown>[]>(response);
  return data.map((item) => mapMergeRequest(item, connection, login)).filter((item) => item.author?.login === login && item.headBranch === branch);
}

export async function revokeGitlabToken(fetchImpl: ProviderFetch, token: string, clientId: string | undefined, host: string) {
  if (!clientId) return;
  const url = `${host.startsWith("http") ? host : `https://${host}`}/oauth/revoke`;
  await providerFetch(fetchImpl, url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token, client_id: clientId }),
  }).catch(() => undefined);
}
