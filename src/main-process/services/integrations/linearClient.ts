import type { IssueItem } from "../../../domain/issues";
import type { IntegrationAccount } from "../../../shared/integrationTypes";
import { issueCacheKey } from "./issueIdentity";
import { providerFetch, readJson, ProviderHttpError } from "./httpClient";
import { logProviderFetchFailure } from "./providerLog";
import type { ProviderFetch } from "./httpClient";
import { mapLinearIssueStatus } from "./statusMapping";

export interface LinearConnection {
  token: string;
}

const VIEWER = "query { viewer { id name displayName avatarUrl } }";
const MINE = `query($after:String){issues(first:50,after:$after,filter:{assignee:{isMe:{eq:true}},completedAt:{null:true},canceledAt:{null:true}}){pageInfo{hasNextPage endCursor}nodes{id identifier title description url updatedAt createdAt assignee{name displayName}creator{name displayName}state{name type}team{key name}labels{nodes{name color}}priority}}}`;

function header(token: string) {
  return { Authorization: token, "Content-Type": "application/json" };
}

async function graphql<T>(fetchImpl: ProviderFetch, token: string, query: string, variables?: Record<string, unknown>) {
  const response = await providerFetch(fetchImpl, "https://api.linear.app/graphql", { method: "POST", headers: header(token), body: JSON.stringify({ query, variables }) });
  if (!response.ok) {
    logProviderFetchFailure({ provider: "linear", status: response.status });
    throw new ProviderHttpError(response.status === 401 ? "unauthorized" : "unreadable", undefined, response.status);
  }
  const payload = await readJson<{ data?: T; errors?: { message?: string; extensions?: { code?: string } }[] }>(response);
  if (payload.errors?.length && !payload.data) {
    logProviderFetchFailure({ provider: "linear", status: response.status, errors: payload.errors });
    const code = payload.errors[0]?.extensions?.code;
    throw new ProviderHttpError(code === "AUTHENTICATION_ERROR" ? "unauthorized" : "unreadable", undefined, response.status);
  }
  if (!payload.data) {
    logProviderFetchFailure({ provider: "linear", status: response.status });
    throw new ProviderHttpError("unreadable", undefined, response.status);
  }
  return payload.data;
}

export async function linearViewer(fetchImpl: ProviderFetch, connection: LinearConnection) {
  const data = await graphql<{ viewer?: { id?: string; name?: string; displayName?: string; avatarUrl?: string } }>(fetchImpl, connection.token, VIEWER);
  const viewer = data.viewer;
  if (!viewer?.id) throw new ProviderHttpError("unreadable");
  const account: IntegrationAccount = { login: viewer.displayName || viewer.name || viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl };
  return { account, scopes: ["read"] };
}

interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  url: string;
  updatedAt?: string;
  createdAt?: string;
  assignee?: { name?: string; displayName?: string };
  creator?: { name?: string; displayName?: string };
  state?: { name?: string; type?: string };
  team?: { key?: string; name?: string };
  labels?: { nodes?: { name?: string; color?: string }[] };
}

function mapIssue(node: LinearIssueNode): IssueItem {
  const login = node.creator?.displayName || node.creator?.name;
  return {
    id: issueCacheKey("linear", "linear.app", node.team?.key, "ISSUE", node.identifier),
    group: "ISSUE",
    title: node.title,
    projectName: node.team?.name || node.team?.key || "Linear",
    provider: "Linear",
    providerId: "linear",
    host: "linear.app",
    repository: node.team?.key,
    url: node.url,
    number: node.identifier,
    status: mapLinearIssueStatus(node.state?.type, node.state?.name),
    nativeStatus: node.state?.name || node.state?.type,
    date: node.updatedAt || node.createdAt || new Date().toISOString(),
    body: node.description,
    author: login ? { login } : undefined,
    assignees: node.assignee ? [{ login: node.assignee.displayName || node.assignee.name || "" }] : undefined,
    labels: node.labels?.nodes?.flatMap((item) => item.name ? [{ name: item.name, color: item.color }] : []),
    lastFetchedAt: new Date().toISOString(),
    source: "remote",
  };
}

export async function listLinearMine(fetchImpl: ProviderFetch, connection: LinearConnection): Promise<IssueItem[]> {
  const items: IssueItem[] = [];
  let after: string | null = null;
  for (let page = 0; page < 4; page += 1) {
    const data: { issues?: { pageInfo?: { hasNextPage?: boolean; endCursor?: string }; nodes?: LinearIssueNode[] } } = await graphql<{ issues?: { pageInfo?: { hasNextPage?: boolean; endCursor?: string }; nodes?: LinearIssueNode[] } }>(fetchImpl, connection.token, MINE, { after });
    for (const node of data.issues?.nodes ?? []) items.push(mapIssue(node));
    if (!data.issues?.pageInfo?.hasNextPage) break;
    after = data.issues.pageInfo.endCursor ?? null;
  }
  return items;
}

export async function getLinearItem(fetchImpl: ProviderFetch, connection: LinearConnection, identifier: string) {
  const search = `query($term:String!){searchIssues(term:$term,first:10){nodes{id identifier title description url updatedAt createdAt assignee{name displayName}creator{name displayName}state{name type}team{key name}labels{nodes{name color}}}}}`;
  const data = await graphql<{ searchIssues?: { nodes?: LinearIssueNode[] } }>(fetchImpl, connection.token, search, { term: identifier });
  const node = data.searchIssues?.nodes?.find((item) => item.identifier.toUpperCase() === identifier.toUpperCase()) ?? data.searchIssues?.nodes?.[0];
  if (!node) throw new ProviderHttpError("notFound");
  return mapIssue(node);
}

export async function revokeLinearToken(fetchImpl: ProviderFetch, token: string) {
  await providerFetch(fetchImpl, "https://api.linear.app/oauth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}
