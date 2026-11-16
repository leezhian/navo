import type { IssueComment, IssueItem, IssuePerson } from "../../../domain/issues";
import type { IntegrationAccount } from "../../../shared/integrationTypes";
import { joinApiPath } from "./instanceUrl";
import { issueCacheKey, githubHostFromApi } from "./issueIdentity";
import { providerFetch, readJson, ProviderHttpError } from "./httpClient";
import { logProviderFetchFailure, logProviderFetchResult } from "./providerLog";
import type { ProviderFetch } from "./httpClient";
import { mapGithubIssueItemStatus, mapGithubIssueStatus } from "./statusMapping";

export interface GithubConnection {
  token: string;
  apiBase: string; // https://api.github.com or https://ghe.example/api
  host: string;
  provider: "github" | "github-enterprise";
}

const SEARCH_QUERY = `query($q:String!,$after:String){search(query:$q,type:ISSUE,first:50,after:$after){pageInfo{hasNextPage endCursor}nodes{...on Issue{__typename id number title body url state updatedAt createdAt author{login avatarUrl ...on User{name}}assignees(first:10){nodes{login name avatarUrl}}labels(first:10){nodes{name color}}repository{nameWithOwner}comments{totalCount}milestone{title}}...on PullRequest{__typename id number title body url state isDraft merged mergeable reviewDecision updatedAt createdAt author{login avatarUrl ...on User{name}}assignees(first:10){nodes{login name avatarUrl}}labels(first:10){nodes{name color}}repository{nameWithOwner}headRefName baseRefName isCrossRepository comments{totalCount}commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}}}`;

function person(value: { login?: string; name?: string; avatarUrl?: string } | null | undefined): IssuePerson | undefined {
  if (!value?.login) return undefined;
  return { login: value.login, name: value.name, avatarUrl: value.avatarUrl };
}

function header(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" };
}

export function githubApiBase(instanceUrl?: string) {
  if (!instanceUrl || instanceUrl === "https://github.com") return "https://api.github.com";
  return joinApiPath(instanceUrl, "api");
}

export function githubGraphqlUrl(apiBase: string) {
  return apiBase === "https://api.github.com" ? "https://api.github.com/graphql" : joinApiPath(apiBase, "graphql");
}

export async function githubViewer(fetchImpl: ProviderFetch, connection: GithubConnection) {
  const response = await providerFetch(fetchImpl, joinApiPath(connection.apiBase, "user"), { headers: header(connection.token) });
  if (!response.ok) throw new ProviderHttpError(response.status === 401 ? "unauthorized" : "rejected", undefined, response.status);
  const data = await readJson<{ login?: string; name?: string; avatar_url?: string }>(response);
  if (!data.login) throw new ProviderHttpError("unreadable");
  const scopes = (response.headers.get("x-oauth-scopes") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const account: IntegrationAccount = { login: data.login, name: data.name ?? undefined, avatarUrl: data.avatar_url };
  return { account, scopes };
}

function mapNode(node: Record<string, unknown>, connection: GithubConnection, login: string): IssueItem | null {
  const isPr = node.__typename === "PullRequest";
  const repo = (node.repository as { nameWithOwner?: string } | undefined)?.nameWithOwner;
  const number = String(node.number ?? "");
  if (!repo || !number || !node.title) return null;
  const host = connection.host || githubHostFromApi(connection.apiBase);
  const author = person(node.author as { login?: string; name?: string; avatarUrl?: string } | undefined);
  const assignees = ((node.assignees as { nodes?: { login?: string; name?: string; avatarUrl?: string }[] } | undefined)?.nodes ?? []).flatMap((item) => person(item) ? [person(item)!] : []);
  const labels = ((node.labels as { nodes?: { name?: string; color?: string }[] } | undefined)?.nodes ?? []).flatMap((item) => item.name ? [{ name: item.name, color: item.color }] : []);
  const mentionedOnly = !isPr && !!login && author?.login !== login && !assignees.some((item) => item.login === login);
  const rollup = isPr ? ((node.commits as { nodes?: { commit?: { statusCheckRollup?: { state?: string } } }[] } | undefined)?.nodes?.[0]?.commit?.statusCheckRollup?.state) : undefined;
  const mergeable = isPr ? String(node.mergeable ?? "") : "";
  const reviewDecision = isPr ? String(node.reviewDecision ?? "") : "";
  return {
    id: issueCacheKey(connection.provider, host, repo, isPr ? "PR" : "ISSUE", number),
    group: isPr ? "PR" : "ISSUE",
    title: String(node.title),
    projectName: repo,
    provider: "GitHub",
    providerId: connection.provider,
    host,
    repository: repo,
    url: String(node.url ?? ""),
    number: `#${number}`,
    numberValue: Number(number),
    status: isPr ? mapGithubIssueStatus(String(node.state ?? "").toLowerCase(), node.isDraft === true, node.merged === true) : mapGithubIssueItemStatus(String(node.state ?? "").toLowerCase()),
    nativeStatus: isPr ? (node.isDraft === true ? "Draft" : node.merged === true ? "Merged" : String(node.state ?? "")) : String(node.state ?? ""),
    date: String(node.updatedAt ?? node.createdAt ?? new Date().toISOString()),
    body: typeof node.body === "string" ? node.body : undefined,
    author,
    authorKind: isPr ? (author?.login === login ? "mine" : "review") : undefined,
    assignees,
    labels,
    milestone: (node.milestone as { title?: string } | undefined)?.title,
    commentCount: (node.comments as { totalCount?: number } | undefined)?.totalCount,
    headBranch: isPr ? String(node.headRefName ?? "") || undefined : undefined,
    baseBranch: isPr ? String(node.baseRefName ?? "") || undefined : undefined,
    isFork: isPr ? node.isCrossRepository === true : undefined,
    mentionedOnly: mentionedOnly || undefined,
    checks: rollup ? { state: rollup === "FAILURE" || rollup === "ERROR" ? "failing" : rollup === "PENDING" || rollup === "EXPECTED" ? "pending" : "passing" } : undefined,
    mergeState: mergeable === "CONFLICTING" ? "conflict" : mergeable === "MERGEABLE" ? "clean" : mergeable ? "blocked" : undefined,
    reviewApproved: reviewDecision ? reviewDecision === "APPROVED" : undefined,
    lastFetchedAt: new Date().toISOString(),
    source: "remote",
  };
}

function githubSearchUser(login: string) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(login)) throw new ProviderHttpError("unreadable");
  return login;
}

export async function listGithubMine(fetchImpl: ProviderFetch, connection: GithubConnection, login: string): Promise<IssueItem[]> {
  const user = githubSearchUser(login);
  const queries = [
    `is:open is:issue archived:false (author:${user} OR assignee:${user} OR mentions:${user})`,
    `is:open is:pr archived:false (author:${user} OR assignee:${user} OR review-requested:${user})`,
  ];
  const items: IssueItem[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    let after: string | null = null;
    for (let page = 0; page < 4; page += 1) {
      const response = await providerFetch(fetchImpl, githubGraphqlUrl(connection.apiBase), {
        method: "POST",
        headers: header(connection.token),
        body: JSON.stringify({ query: SEARCH_QUERY, variables: { q, after } }),
      });
      if (!response.ok) {
        logProviderFetchFailure({ provider: connection.provider, status: response.status });
        throw new ProviderHttpError(response.status === 401 ? "unauthorized" : "unreadable", undefined, response.status);
      }
      const payload = await readJson<{ data?: { search?: { pageInfo?: { hasNextPage?: boolean; endCursor?: string }; nodes?: Record<string, unknown>[] } }; errors?: { type?: string; message?: string }[] }>(response);
      if (payload.errors?.length) {
        logProviderFetchFailure({ provider: connection.provider, status: response.status, errors: payload.errors });
        if (!payload.data?.search) throw new ProviderHttpError("unreadable", undefined, response.status);
      }
      const mapped: IssueItem[] = [];
      for (const node of payload.data?.search?.nodes ?? []) {
        const item = mapNode(node, connection, login);
        if (item && !seen.has(item.id)) { seen.add(item.id); items.push(item); mapped.push(item); }
      }
      if (payload.errors?.length && !mapped.length) throw new ProviderHttpError("unreadable", undefined, response.status);
      if (!payload.data?.search?.pageInfo?.hasNextPage) break;
      after = payload.data.search.pageInfo.endCursor ?? null;
    }
  }
  logProviderFetchResult({ provider: connection.provider, count: items.length });
  return items;
}

export async function getGithubItem(fetchImpl: ProviderFetch, connection: GithubConnection, repository: string, group: "PR" | "ISSUE", number: string, login: string) {
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new ProviderHttpError("notFound");
  const path = group === "PR" ? `repos/${owner}/${repo}/pulls/${number}` : `repos/${owner}/${repo}/issues/${number}`;
  const response = await providerFetch(fetchImpl, joinApiPath(connection.apiBase, path), { headers: header(connection.token) });
  if (!response.ok) {
    logProviderFetchFailure({ provider: connection.provider, status: response.status });
    throw new ProviderHttpError(response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 404 ? "notFound" : "unreadable", undefined, response.status);
  }
  const data = await readJson<Record<string, unknown>>(response);
  const isPr = group === "PR" || data.pull_request !== undefined || data.head !== undefined;
  const q = isPr ? `repo:${owner}/${repo} is:pr ${number}` : `repo:${owner}/${repo} is:issue ${number}`;
  const listed = await listByQuery(fetchImpl, connection, q, login);
  return listed[0] ?? mapRest(data, connection, login, owner, repo, isPr);
}

async function listByQuery(fetchImpl: ProviderFetch, connection: GithubConnection, q: string, login: string) {
  const response = await providerFetch(fetchImpl, githubGraphqlUrl(connection.apiBase), {
    method: "POST", headers: header(connection.token), body: JSON.stringify({ query: SEARCH_QUERY, variables: { q, after: null } }),
  });
  if (!response.ok) {
    logProviderFetchFailure({ provider: connection.provider, status: response.status });
    return [];
  }
  const payload = await readJson<{ data?: { search?: { nodes?: Record<string, unknown>[] } }; errors?: { type?: string; message?: string }[] }>(response);
  if (payload.errors?.length && !payload.data?.search) {
    logProviderFetchFailure({ provider: connection.provider, status: response.status, errors: payload.errors });
    return [];
  }
  return (payload.data?.search?.nodes ?? []).flatMap((node) => {
    const item = mapNode(node, connection, login);
    return item ? [item] : [];
  });
}

function mapRest(data: Record<string, unknown>, connection: GithubConnection, login: string, owner: string, repo: string, isPr: boolean): IssueItem {
  const number = String(data.number ?? "");
  const host = connection.host || githubHostFromApi(connection.apiBase);
  const author = person({ login: (data.user as { login?: string; name?: string; avatar_url?: string } | undefined)?.login, name: (data.user as { name?: string } | undefined)?.name, avatarUrl: (data.user as { avatar_url?: string } | undefined)?.avatar_url });
  const state = String(data.state ?? "").toLowerCase();
  return {
    id: issueCacheKey(connection.provider, host, `${owner}/${repo}`, isPr ? "PR" : "ISSUE", number),
    group: isPr ? "PR" : "ISSUE",
    title: String(data.title ?? ""),
    projectName: `${owner}/${repo}`,
    provider: "GitHub",
    providerId: connection.provider,
    host,
    repository: `${owner}/${repo}`,
    url: String(data.html_url ?? ""),
    number: `#${number}`,
    numberValue: Number(number),
    status: isPr ? mapGithubIssueStatus(data.merged_at ? "merged" : state, data.draft === true, Boolean(data.merged_at)) : mapGithubIssueItemStatus(state),
    nativeStatus: isPr && data.draft === true ? "Draft" : state,
    date: String(data.updated_at ?? data.created_at ?? new Date().toISOString()),
    body: typeof data.body === "string" ? data.body : undefined,
    author,
    authorKind: isPr ? (author?.login === login ? "mine" : "review") : undefined,
    assignees: ((data.assignees as { login?: string; name?: string; avatar_url?: string }[] | undefined) ?? []).flatMap((item) => item.login ? [{ login: item.login, name: item.name, avatarUrl: item.avatar_url }] : []),
    labels: ((data.labels as { name?: string; color?: string }[] | undefined) ?? []).flatMap((item) => item.name ? [{ name: item.name, color: item.color }] : []),
    headBranch: isPr ? (data.head as { ref?: string } | undefined)?.ref : undefined,
    baseBranch: isPr ? (data.base as { ref?: string } | undefined)?.ref : undefined,
    lastFetchedAt: new Date().toISOString(),
    source: "remote",
  };
}

export async function listGithubComments(fetchImpl: ProviderFetch, connection: GithubConnection, repository: string, number: string, page = 1): Promise<{ comments: IssueComment[]; hasEarlier: boolean }> {
  const [owner, repo] = repository.split("/");
  const response = await providerFetch(fetchImpl, `${joinApiPath(connection.apiBase, `repos/${owner}/${repo}/issues/${number}/comments`)}?per_page=100&page=${page}`, { headers: header(connection.token) });
  if (!response.ok) {
    logProviderFetchFailure({ provider: connection.provider, status: response.status });
    throw new ProviderHttpError(response.status === 401 ? "unauthorized" : "unreadable", undefined, response.status);
  }
  const data = await readJson<{ id: number; user?: { login?: string; name?: string; avatar_url?: string }; body?: string; created_at?: string }[]>(response);
  const comments: IssueComment[] = data.map((item) => ({
    id: String(item.id),
    author: item.user?.login ? { login: item.user.login, name: item.user.name, avatarUrl: item.user.avatar_url } : undefined,
    body: item.body ?? "",
    createdAt: item.created_at ?? new Date().toISOString(),
  }));
  const link = response.headers.get("link") ?? "";
  return { comments, hasEarlier: page > 1 || /rel="next"/.test(link) };
}

export async function listGithubPullsForBranch(fetchImpl: ProviderFetch, connection: GithubConnection, repository: string, branch: string, login: string) {
  const [owner, repo] = repository.split("/");
  const response = await providerFetch(fetchImpl, `${joinApiPath(connection.apiBase, `repos/${owner}/${repo}/pulls`)}?head=${encodeURIComponent(`${owner}:${branch}`)}&state=open`, { headers: header(connection.token) });
  if (!response.ok) {
    logProviderFetchFailure({ provider: connection.provider, status: response.status });
    throw new ProviderHttpError(response.status === 401 ? "unauthorized" : "unreadable", undefined, response.status);
  }
  const data = await readJson<Record<string, unknown>[]>(response);
  return data.map((item) => mapRest(item, connection, login, owner, repo, true)).filter((item) => item.author?.login === login && item.headBranch === branch);
}
