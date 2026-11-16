import type {
  IntegrationAuthState, IntegrationConnectInput, IntegrationConnectResult, IntegrationProviderId, IntegrationStatus, IssueListResult, IssueResolveResult,
} from "@/shared/integrationTypes";
import type { NavoApi } from "@/shared/electronApi";
import type { IssueItem } from "@/domain/issues";

/** 预加载脚本尚未暴露集成 API 时（例如升级中间态）统一转为拒绝，由调用方各自兜底，不抛同步异常打断渲染。 */
function withIntegrations<T>(run: (api: NavoApi["integrations"]) => Promise<T>): Promise<T> {
  const integrations = window.navo?.integrations;
  return integrations ? run(integrations) : Promise.reject(new Error("INTEGRATION_API_UNAVAILABLE"));
}

function withIssues<T>(run: (api: NavoApi["issues"]) => Promise<T>): Promise<T> {
  const issues = window.navo?.issues;
  return issues ? run(issues) : Promise.reject(new Error("INTEGRATION_API_UNAVAILABLE"));
}

export function loadIntegrationStatuses(): Promise<IntegrationStatus[]> {
  return withIntegrations((api) => api.list());
}

export function connectIntegration(input: IntegrationConnectInput): Promise<IntegrationConnectResult> {
  return withIntegrations((api) => api.connect(input));
}

export function cancelIntegration(id: IntegrationProviderId): Promise<void> {
  return withIntegrations((api) => api.cancel(id));
}

export function disconnectIntegration(id: IntegrationProviderId): Promise<void> {
  return withIntegrations((api) => api.disconnect(id));
}

export function refreshIntegrationStatuses(): Promise<IntegrationStatus[]> {
  return withIntegrations((api) => api.refreshStatuses());
}

export function integrationAuthState(id: IntegrationProviderId): Promise<IntegrationAuthState> {
  return withIntegrations((api) => api.authState(id));
}

/** 没有集成 API 就没有可订阅事件，返回空退订函数保持调用方签名不变。 */
export function onIntegrationsChanged(listener: () => void) {
  const integrations = window.navo?.integrations;
  return integrations ? integrations.onChanged(listener) : () => undefined;
}

export function listMineIssues(options?: { refresh?: boolean }): Promise<IssueListResult> {
  return withIssues((api) => api.list(options));
}

export function getIssueItem(id: string, options?: { refresh?: boolean; commentsPage?: number }): Promise<IssueItem | null> {
  return withIssues((api) => api.get(id, options));
}

export function resolveIssueUrl(value: string): Promise<IssueResolveResult> {
  return withIssues((api) => api.resolveUrl(value));
}

export function importLocalIssues(items: IssueItem[]): Promise<void> {
  return withIssues((api) => api.importLocal(items));
}

/** 没有集成 API 就没有可订阅事件，返回空退订函数保持调用方签名不变。 */
export function onIssuesChanged(listener: () => void) {
  const issues = window.navo?.issues;
  return issues ? issues.onChanged(listener) : () => undefined;
}

export function ensureIssueNote(taskId: string, issueId: string) {
  return withIssues((api) => api.ensureNote(taskId, issueId));
}

export function worktreesForPullRequest(taskId: string, pullRequestId: string) {
  return withIssues((api) => api.worktreesForPullRequest(taskId, pullRequestId));
}

export function pullRequestForWorktree(taskId: string, resourceId: string) {
  return withIssues((api) => api.pullRequestForWorktree(taskId, resourceId));
}
