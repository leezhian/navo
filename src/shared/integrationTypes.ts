export const INTEGRATION_PROVIDER_IDS = ["github", "github-enterprise", "gitlab", "gitlab-self-hosted", "linear"] as const;
export type IntegrationProviderId = (typeof INTEGRATION_PROVIDER_IDS)[number];

export const INTEGRATION_PROVIDERS: { id: IntegrationProviderId; name: string; cloud: boolean; hasPullRequests: boolean }[] = [
  { id: "github", name: "GitHub", cloud: true, hasPullRequests: true },
  { id: "gitlab", name: "GitLab", cloud: true, hasPullRequests: true },
  { id: "github-enterprise", name: "GitHub Enterprise", cloud: false, hasPullRequests: true },
  { id: "gitlab-self-hosted", name: "GitLab Self-Hosted", cloud: false, hasPullRequests: true },
  { id: "linear", name: "Linear", cloud: true, hasPullRequests: false },
];

export type IntegrationAuthMethod = "oauth" | "pat";
export type IntegrationWarning = "expired" | "unreachable" | "unreadable" | "orgDenied";
export type IntegrationTokenCheck = "verified" | "tls" | "unreachable" | "rejected";

export interface IntegrationAccount {
  login: string;
  name?: string;
  avatarUrl?: string;
}

export interface IntegrationStatus {
  id: IntegrationProviderId;
  name: string;
  connected: boolean;
  /** 云端平台在已配置 client id 时提供一键登录。 */
  oauthAvailable: boolean;
  authMethod?: IntegrationAuthMethod;
  host?: string;
  account?: IntegrationAccount;
  scopes?: string[];
  missingScopes?: string[];
  warning?: IntegrationWarning;
  deniedOrganizations?: string[];
}

export interface IntegrationConnectPatInput {
  id: IntegrationProviderId;
  method: "pat";
  token: string;
  host?: string;
}

export interface IntegrationConnectOauthInput {
  id: IntegrationProviderId;
  method: "oauth";
}

export type IntegrationConnectInput = IntegrationConnectPatInput | IntegrationConnectOauthInput;

export interface IntegrationDeviceAuth {
  kind: "device";
  id: IntegrationProviderId;
  userCode: string;
  verificationUrl: string;
  expiresAt: string;
}

export interface IntegrationBrowserAuth {
  kind: "browser";
  id: IntegrationProviderId;
  authorizeUrl: string;
  expiresAt: string;
}

export type IntegrationAuthSession = IntegrationDeviceAuth | IntegrationBrowserAuth;

export interface IntegrationPatResult {
  kind: "pat";
  status: IntegrationStatus;
  check: IntegrationTokenCheck;
}

export type IntegrationConnectResult = IntegrationAuthSession | IntegrationPatResult;

export type IntegrationAuthError = "denied" | "expired" | "cancelled" | "failed" | "secretRequired" | "portBusy";

export interface IntegrationAuthState {
  session?: IntegrationAuthSession;
  error?: IntegrationAuthError;
}


export interface IssueListFailure {
  id: IntegrationProviderId;
  warning: IntegrationWarning;
}

export interface IssueListResult {
  items: import("../domain/issues").IssueItem[];
  failures: IssueListFailure[];
  fetchedAt: string | null;
  stale: boolean;
}

export interface IssueResolveResult {
  item?: import("../domain/issues").IssueItem;
  error?: "notFound" | "forbidden" | "disconnected" | "unsupported" | "unreachable" | "unreadable";
}

export interface IssueWorktreeMatch {
  taskId: string;
  resourceId: string;
  name: string;
  workingPath: string;
  branch: string;
}

export const INTEGRATION_REQUIRED_SCOPES: Record<IntegrationProviderId, string[]> = {
  github: ["repo", "read:user"],
  "github-enterprise": ["repo", "read:user"],
  gitlab: ["read_api", "read_user"],
  "gitlab-self-hosted": ["read_api", "read_user"],
  linear: ["read"],
};
