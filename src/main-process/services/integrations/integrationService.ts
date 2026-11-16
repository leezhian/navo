import type { IssueItem } from "../../../domain/issues";
import type {
  IntegrationAuthError, IntegrationAuthMethod, IntegrationAuthSession, IntegrationAuthState, IntegrationConnectInput, IntegrationConnectResult, IntegrationPatResult,
  IntegrationProviderId, IntegrationStatus, IntegrationTokenCheck, IntegrationWarning, IssueListFailure, IssueListResult, IssueResolveResult,
} from "../../../shared/integrationTypes";
import { INTEGRATION_PROVIDERS, INTEGRATION_REQUIRED_SCOPES } from "../../../shared/integrationTypes";
import { oauthAvailable, oauthClientId } from "./oauthClients";
import type { TokenCipher } from "./tokenCipher";
import { normalizeInstanceUrl } from "./instanceUrl";
import { ProviderHttpError } from "./httpClient";
import type { ProviderFetch } from "./httpClient";
import { requestGithubDeviceCode, pollGithubDeviceToken } from "./githubDeviceFlow";
import { buildAuthorizeUrl, createOAuthState, createPkcePair, exchangeAuthorizationCode, refreshAccessToken, startLoopbackListener } from "./pkceOAuth";
import { IntegrationRepository } from "./integrationRepository";
import type { StoredConnection } from "./integrationRepository";
import { IssueCacheRepository } from "./issueCacheRepository";
import { githubApiBase, githubViewer, listGithubMine, getGithubItem, listGithubComments, listGithubPullsForBranch } from "./githubClient";
import { gitlabApiBase, gitlabHost, gitlabViewer, listGitlabMine, getGitlabItem, listGitlabComments, listGitlabMergeRequestsForBranch, revokeGitlabToken } from "./gitlabClient";
import { linearViewer, listLinearMine, getLinearItem, revokeLinearToken } from "./linearClient";
import { parseProviderIssueUrl } from "./issueIdentity";
import { isIssueItem } from "../../../utils/adeDataValidation";

export interface IntegrationRuntime {
  filename: string;
  cipher: TokenCipher;
  fetch: ProviderFetch;
  openExternal: (url: string) => Promise<void>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onChanged?: () => void;
  onIssuesChanged?: () => void;
}

interface PendingOauth {
  id: IntegrationProviderId;
  abort: AbortController;
  session: IntegrationAuthSession;
  close?: () => Promise<void> | void;
}

const SUCCESS_HTML = "<!doctype html><meta charset=utf-8><title>Navo</title><p>Authorization complete. You can close this window.</p><p>授权完成，可以关闭此窗口。</p>";
const FAILURE_HTML = "<!doctype html><meta charset=utf-8><title>Navo</title><p>Authorization failed. You can close this window and retry in Navo.</p><p>授权失败，可以关闭此窗口并在 Navo 中重试。</p>";

function warningFromError(error: unknown): IntegrationWarning {
  if (error instanceof ProviderHttpError) {
    if (error.code === "unauthorized") return "expired";
    if (error.code === "tls" || error.code === "unreachable") return "unreachable";
    if (error.code === "unreadable") return "unreadable";
    return "expired";
  }
  return "unreachable";
}

function tokenCheckFromError(error: unknown): IntegrationTokenCheck {
  if (error instanceof ProviderHttpError) {
    if (error.code === "tls") return "tls";
    if (error.code === "unreachable") return "unreachable";
    return "rejected";
  }
  return "unreachable";
}

export class IntegrationService {
  readonly connections: IntegrationRepository;
  readonly cache: IssueCacheRepository;
  private pending = new Map<IntegrationProviderId, PendingOauth>();
  private authErrors = new Map<IntegrationProviderId, IntegrationAuthError>();
  constructor(private readonly runtime: IntegrationRuntime) {
    this.connections = new IntegrationRepository(runtime.filename, runtime.cipher);
    this.cache = new IssueCacheRepository(runtime.filename);
  }

  private notify() { this.runtime.onChanged?.(); }
  private notifyIssues() { this.runtime.onIssuesChanged?.(); }
  private now() { return this.runtime.now?.() ?? Date.now(); }
  private sleep(ms: number) { return (this.runtime.sleep ?? ((value) => new Promise((resolve) => setTimeout(resolve, value))))(ms); }

  async listStatuses(): Promise<IntegrationStatus[]> {
    const stored = await this.connections.list();
    return INTEGRATION_PROVIDERS.map((provider) => {
      const connection = stored.find((item) => item.id === provider.id);
      return {
        id: provider.id,
        name: provider.name,
        connected: !!connection,
        oauthAvailable: provider.cloud && oauthAvailable(provider.id),
        authMethod: connection?.authMethod,
        host: connection && !provider.cloud ? connection.host : undefined,
        account: connection?.account,
        scopes: connection?.scopes,
        missingScopes: connection?.missingScopes,
        warning: connection?.warning,
        deniedOrganizations: connection?.deniedOrganizations,
      };
    });
  }

  async connect(input: IntegrationConnectInput): Promise<IntegrationConnectResult> {
    if (input.method === "pat") return this.connectPat(input.id, input.token, input.host);
    const provider = INTEGRATION_PROVIDERS.find((item) => item.id === input.id);
    if (!provider?.cloud) throw new Error("INTEGRATION_OAUTH_UNAVAILABLE");
    if (!oauthAvailable(input.id)) throw new Error("INTEGRATION_OAUTH_UNAVAILABLE");
    this.abortPending(input.id);
    this.authErrors.delete(input.id);
    if (input.id === "github") return this.startGithubDevice();
    if (input.id !== "gitlab" && input.id !== "linear") throw new Error("INTEGRATION_OAUTH_UNAVAILABLE");
    return this.startBrowserOauth(input.id);
  }

  async cancel(id: IntegrationProviderId) {
    if (this.abortPending(id)) {
      this.authErrors.set(id, "cancelled");
      this.notify();
    }
  }

  private abortPending(id: IntegrationProviderId) {
    const pending = this.pending.get(id);
    if (!pending) return false;
    void pending.close?.();
    pending.abort.abort();
    this.pending.delete(id);
    return true;
  }

  async disconnect(id: IntegrationProviderId) {
    const connection = await this.connections.get(id);
    const secrets = await this.connections.secrets(id).catch(() => null);
    if (secrets) {
      if (id === "linear") await revokeLinearToken(this.runtime.fetch, secrets.accessToken).catch(() => undefined);
      if (id === "gitlab" || id === "gitlab-self-hosted") await revokeGitlabToken(this.runtime.fetch, secrets.accessToken, oauthClientId("gitlab") || undefined, connection?.host ? `https://${connection.host}` : "https://gitlab.com").catch(() => undefined);
    }
    await this.cache.deleteProvider(id);
    await this.connections.remove(id);
    this.notify();
  }

  async refreshStatuses(): Promise<IntegrationStatus[]> {
    for (const connection of await this.connections.list()) {
      try {
        await this.refreshIfNeeded(connection.id);
        const viewer = await this.viewer(connection.id);
        await this.connections.updateMetadata(connection.id, { account: viewer.account, scopes: viewer.scopes, missingScopes: this.missingScopes(connection.id, viewer.scopes, connection.authMethod), warning: undefined });
      } catch (error) {
        await this.connections.updateMetadata(connection.id, { warning: warningFromError(error) });
      }
    }
    return this.listStatuses();
  }

  private missingScopes(id: IntegrationProviderId, scopes: string[], authMethod?: IntegrationAuthMethod) {
    const required = INTEGRATION_REQUIRED_SCOPES[id];
    if (!required.length) return [];
    // GitHub OAuth App 会返回真实 scope，空列表按缺 repo/read:user 处理。
    // 细粒度 GitHub / GHE PAT 校验通过后 X-OAuth-Scopes 常为空，不能按 classic scope 缺项来报。
    // GitLab / Linear 的 viewer 也不一定返回已授权 scope。
    if (!scopes.length && !(authMethod === "oauth" && (id === "github" || id === "github-enterprise"))) return [];
    const have = new Set(scopes);
    // GitLab 的 api 覆盖 read_api；不要求也不申请 api。
    if (have.has("api")) have.add("read_api");
    return required.filter((scope) => !have.has(scope));
  }

  private async connectPat(id: IntegrationProviderId, token: string, host?: string): Promise<IntegrationPatResult> {
    if (typeof token !== "string" || !token.trim() || token.length > 16384 || token.includes("\0")) throw new Error("INTEGRATION_INVALID_TOKEN");
    const provider = INTEGRATION_PROVIDERS.find((item) => item.id === id);
    if (!provider) throw new Error("INTEGRATION_INVALID");
    let instance = provider.cloud ? (id === "gitlab" ? "https://gitlab.com" : id === "github" ? "https://github.com" : "https://linear.app") : "";
    if (!provider.cloud) instance = normalizeInstanceUrl(host ?? "");
    const connection = this.connectionFrom(id, instance, "pat");
    try {
      const viewer = await this.viewerWith(connection, token.trim());
      await this.connections.save({
        ...connection,
        account: viewer.account,
        scopes: viewer.scopes,
        missingScopes: this.missingScopes(id, viewer.scopes, "pat"),
      }, { accessToken: token.trim() });
      this.notify();
      const statuses = await this.listStatuses();
      return { kind: "pat", status: statuses.find((item) => item.id === id)!, check: "verified" };
    } catch (error) {
      const check = tokenCheckFromError(error);
      if (check === "rejected") throw Object.assign(new Error("INTEGRATION_TOKEN_REJECTED"), { check });
      await this.connections.save({ ...connection, warning: "unreachable" }, { accessToken: token.trim() });
      this.notify();
      const statuses = await this.listStatuses();
      return { kind: "pat", status: { ...statuses.find((item) => item.id === id)!, warning: "unreachable" }, check };
    }
  }

  private connectionFrom(id: IntegrationProviderId, instance: string, authMethod: "oauth" | "pat"): StoredConnection {
    if (id === "github" || id === "github-enterprise") {
      const apiBase = githubApiBase(id === "github" ? undefined : instance);
      return { id, authMethod, host: id === "github" ? "github.com" : new URL(instance).hostname.toLowerCase(), apiBase, scopes: [], missingScopes: [] };
    }
    if (id === "gitlab" || id === "gitlab-self-hosted") {
      const apiBase = gitlabApiBase(id === "gitlab" ? undefined : instance);
      return { id, authMethod, host: gitlabHost(id === "gitlab" ? undefined : instance), apiBase, scopes: [], missingScopes: [] };
    }
    return { id, authMethod, host: "linear.app", apiBase: "https://api.linear.app", scopes: [], missingScopes: [] };
  }

  private async startGithubDevice(): Promise<IntegrationAuthSession> {
    const clientId = oauthClientId("github");
    const start = await requestGithubDeviceCode(this.runtime.fetch, { clientId, scope: INTEGRATION_REQUIRED_SCOPES.github.join(" ") });
    const session: IntegrationAuthSession = { kind: "device", id: "github", userCode: start.userCode, verificationUrl: start.verificationUrl, expiresAt: new Date(this.now() + start.expiresIn * 1000).toISOString() };
    const abort = new AbortController();
    this.pending.set("github", { id: "github", abort, session });
    void this.runtime.openExternal(start.verificationUrl).catch(() => undefined);
    void this.pollGithub(clientId, start.deviceCode, start.interval, abort);
    return session;
  }

  private async pollGithub(clientId: string, deviceCode: string, interval: number, abort: AbortController) {
    let wait = interval;
    while (!abort.signal.aborted) {
      await this.sleep(wait * 1000);
      if (abort.signal.aborted) return;
      try {
        const result = await pollGithubDeviceToken(this.runtime.fetch, { clientId, deviceCode });
        if (result.status === "pending") { if (result.interval) wait += result.interval; continue; }
        if (result.status === "denied" || result.status === "expired") {
          this.pending.delete("github");
          this.authErrors.set("github", result.status);
          this.notify();
          return;
        }
        const connection = this.connectionFrom("github", "https://github.com", "oauth");
        const viewer = await this.viewerWith(connection, result.token.accessToken);
        const granted = result.token.scope?.split(/[,\s]+/).filter(Boolean) ?? [];
        const scopes = granted.length ? granted : viewer.scopes;
        // 只有同时拿到 refresh_token 与 expires_in 时才按可续期 token 保存；否则视为长期 token，不续期。
        const expiresAt = result.token.refreshToken && result.token.expiresIn ? new Date(this.now() + result.token.expiresIn * 1000).toISOString() : undefined;
        await this.connections.save({
          ...connection, account: viewer.account, scopes,
          missingScopes: this.missingScopes("github", scopes, "oauth"), expiresAt,
        }, { accessToken: result.token.accessToken, refreshToken: result.token.refreshToken });
        this.pending.delete("github");
        this.authErrors.delete("github");
        this.notify();
        return;
      } catch { this.pending.delete("github"); this.authErrors.set("github", "failed"); this.notify(); return; }
    }
  }

  private async startBrowserOauth(id: "gitlab" | "linear"): Promise<IntegrationAuthSession> {
    const clientId = oauthClientId(id);
    const { verifier, challenge } = createPkcePair();
    const state = createOAuthState();
    const loopback = await startLoopbackListener({ expectedState: state, successHtml: SUCCESS_HTML, failureHtml: FAILURE_HTML });
    const authorizeUrl = id === "gitlab"
      ? buildAuthorizeUrl("https://gitlab.com/oauth/authorize", { client_id: clientId, redirect_uri: loopback.redirectUri, response_type: "code", scope: "read_api read_user", state, code_challenge: challenge, code_challenge_method: "S256" })
      : buildAuthorizeUrl("https://linear.app/oauth/authorize", { client_id: clientId, redirect_uri: loopback.redirectUri, response_type: "code", scope: "read", state, code_challenge: challenge, code_challenge_method: "S256", actor: "user" });
    const session: IntegrationAuthSession = { kind: "browser", id, authorizeUrl, expiresAt: new Date(this.now() + 5 * 60_000).toISOString() };
    const abort = new AbortController();
    this.pending.set(id, { id, abort, session, close: loopback.close });
    void this.runtime.openExternal(authorizeUrl).catch(() => undefined);
    void this.completeBrowserOauth(id, clientId, verifier, loopback, abort);
    return session;
  }

  private async completeBrowserOauth(id: "gitlab" | "linear", clientId: string, verifier: string, loopback: Awaited<ReturnType<typeof startLoopbackListener>>, abort: AbortController) {
    try {
      const callback = await Promise.race([
        loopback.result,
        new Promise<never>((_, reject) => abort.signal.addEventListener("abort", () => reject(new Error("INTEGRATION_AUTH_CANCELLED")))),
      ]);
      if (abort.signal.aborted) return;
      const tokenUrl = id === "gitlab" ? "https://gitlab.com/oauth/token" : "https://api.linear.app/oauth/token";
      const token = await exchangeAuthorizationCode(this.runtime.fetch, { tokenUrl, clientId, code: callback.code, redirectUri: loopback.redirectUri, verifier });
      const connection = this.connectionFrom(id, id === "gitlab" ? "https://gitlab.com" : "https://linear.app", "oauth");
      const viewer = await this.viewerWith(connection, token.accessToken);
      const expiresAt = token.expiresIn ? new Date(this.now() + token.expiresIn * 1000).toISOString() : undefined;
      await this.connections.save({
        ...connection, account: viewer.account, scopes: token.scope?.split(/[,\s]+/).filter(Boolean) ?? viewer.scopes,
        missingScopes: this.missingScopes(id, token.scope?.split(/[,\s]+/).filter(Boolean) ?? viewer.scopes, "oauth"), expiresAt,
      }, { accessToken: token.accessToken, refreshToken: token.refreshToken });
      this.notify();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!abort.signal.aborted) {
        if (message === "INTEGRATION_OAUTH_SECRET_REQUIRED") this.authErrors.set(id, "secretRequired");
        else if (message === "INTEGRATION_AUTH_DENIED" || message.endsWith("DENIED")) this.authErrors.set(id, "denied");
        else if (message === "INTEGRATION_AUTH_EXPIRED") this.authErrors.set(id, "expired");
        else if (message === "INTEGRATION_AUTH_PORT_BUSY") this.authErrors.set(id, "portBusy");
        else if (message !== "INTEGRATION_AUTH_CANCELLED") this.authErrors.set(id, "failed");
        this.notify();
      }
    }
    finally {
      void loopback.close();
      this.pending.delete(id);
    }
  }

  waitForPending(id: IntegrationProviderId) {
    return this.pending.has(id);
  }

  pendingSession(id: IntegrationProviderId) {
    return this.pending.get(id)?.session;
  }

  authState(id: IntegrationProviderId): IntegrationAuthState {
    return { session: this.pending.get(id)?.session, error: this.authErrors.get(id) };
  }

  private async viewer(id: IntegrationProviderId) {
    const connection = await this.connections.get(id);
    const secrets = await this.connections.secrets(id);
    if (!connection || !secrets) throw new Error("INTEGRATION_NOT_CONNECTED");
    return this.viewerWith(connection, secrets.accessToken);
  }

  private async viewerWith(connection: StoredConnection, token: string) {
    if (connection.id === "github" || connection.id === "github-enterprise") {
      return githubViewer(this.runtime.fetch, { token, apiBase: connection.apiBase, host: connection.host, provider: connection.id });
    }
    if (connection.id === "gitlab" || connection.id === "gitlab-self-hosted") {
      return gitlabViewer(this.runtime.fetch, { token, apiBase: connection.apiBase, host: connection.host, provider: connection.id });
    }
    return linearViewer(this.runtime.fetch, { token });
  }

  private refreshInFlight = new Map<IntegrationProviderId, Promise<void>>();

  private async refreshIfNeeded(id: IntegrationProviderId) {
    const connection = await this.connections.get(id);
    const secrets = await this.connections.secrets(id);
    if (!connection || !secrets?.refreshToken || !connection.expiresAt) return;
    if (Date.parse(connection.expiresAt) - this.now() > 60_000) return;
    const existing = this.refreshInFlight.get(id);
    if (existing) return existing;
    const run = this.refreshTokens(id).finally(() => { this.refreshInFlight.delete(id); });
    this.refreshInFlight.set(id, run);
    return run;
  }

  private async refreshTokens(id: IntegrationProviderId) {
    const connection = await this.connections.get(id);
    const secrets = await this.connections.secrets(id);
    if (!connection || !secrets?.refreshToken) return;
    let tokenUrl: string;
    let clientId: string;
    if (id === "github") {
      tokenUrl = "https://github.com/login/oauth/access_token";
      clientId = oauthClientId("github");
    } else if (id === "gitlab" || id === "gitlab-self-hosted") {
      tokenUrl = `${connection.apiBase.replace(/\/api\/v4$/, "")}/oauth/token`;
      clientId = oauthClientId(id === "gitlab-self-hosted" ? "gitlab" : id);
    } else if (id === "linear") {
      tokenUrl = "https://api.linear.app/oauth/token";
      clientId = oauthClientId("linear");
    } else {
      return;
    }
    if (!clientId) {
      await this.connections.updateMetadata(id, { warning: "expired" });
      this.notify();
      throw new Error("INTEGRATION_TOKEN_EXPIRED");
    }
    try {
      const token = await refreshAccessToken(this.runtime.fetch, { tokenUrl, clientId, refreshToken: secrets.refreshToken });
      // GitHub 每次刷新都会作废旧 refresh token，必须拿到新的一对再写入。
      const nextRefresh = token.refreshToken ?? (id === "github" ? undefined : secrets.refreshToken);
      if (!nextRefresh) throw new Error("INTEGRATION_TOKEN_EXPIRED");
      const expiresAt = token.expiresIn ? new Date(this.now() + token.expiresIn * 1000).toISOString() : connection.expiresAt;
      await this.connections.save({ ...connection, expiresAt, warning: undefined }, { accessToken: token.accessToken, refreshToken: nextRefresh });
      this.notify();
    } catch (error) {
      await this.connections.updateMetadata(id, { warning: "expired" });
      this.notify();
      throw error;
    }
  }

  async listMine(options: { refresh?: boolean } = {}): Promise<IssueListResult> {
    const cached = await this.cache.mine();
    if (!options.refresh && cached.fetchedAt && this.now() - Date.parse(cached.fetchedAt) < 60_000) {
      return { items: cached.items, failures: [], fetchedAt: cached.fetchedAt, stale: cached.stale };
    }
    const statuses = await this.connections.list();
    if (!statuses.length) return { items: cached.items.filter((item) => item.source === "local"), failures: [], fetchedAt: cached.fetchedAt, stale: cached.stale };
    const failures: IssueListFailure[] = [];
    const collected: IssueItem[] = [];
    for (const connection of statuses) {
      try {
        await this.refreshIfNeeded(connection.id);
        const secrets = await this.connections.secrets(connection.id);
        if (!secrets) continue;
        const items = await this.listProvider(connection, secrets.accessToken);
        collected.push(...items);
        await this.connections.updateMetadata(connection.id, { warning: undefined });
      } catch (error) {
        const warning = warningFromError(error);
        failures.push({ id: connection.id, warning });
        await this.connections.updateMetadata(connection.id, { warning });
      }
    }
    const fetchedAt = new Date(this.now()).toISOString();
    if (collected.length) await this.cache.put(collected, fetchedAt);
    const failedIds = new Set(failures.map((item) => item.id));
    const previous = cached.items.filter((item) => item.source === "remote" && item.providerId && failedIds.has(item.providerId));
    const locals = cached.items.filter((item) => item.source === "local");
    const merged = [...collected, ...previous, ...locals];
    const ids = [...new Set(merged.map((item) => item.id))];
    await this.cache.setMineIds(ids, fetchedAt, failures.length > 0);
    if (failures.length) await this.cache.markMineStale();
    const next = await this.cache.mine();
    this.notifyIssues();
    return { items: next.items, failures, fetchedAt: next.fetchedAt, stale: failures.length > 0 };
  }

  private async listProvider(connection: StoredConnection, token: string): Promise<IssueItem[]> {
    if (connection.id === "github" || connection.id === "github-enterprise") {
      const github = { token, apiBase: connection.apiBase, host: connection.host, provider: connection.id };
      const viewer = await githubViewer(this.runtime.fetch, github);
      return listGithubMine(this.runtime.fetch, github, viewer.account.login);
    }
    if (connection.id === "gitlab" || connection.id === "gitlab-self-hosted") {
      const gitlab = { token, apiBase: connection.apiBase, host: connection.host, provider: connection.id };
      const viewer = await gitlabViewer(this.runtime.fetch, gitlab);
      return listGitlabMine(this.runtime.fetch, gitlab, viewer.account.login);
    }
    return listLinearMine(this.runtime.fetch, { token });
  }

  async getItem(id: string, options: { refresh?: boolean; commentsPage?: number } = {}): Promise<IssueItem | null> {
    const cached = await this.cache.get(id);
    if (!options.refresh && cached && (!options.commentsPage || cached.comments) && cached.lastFetchedAt && this.now() - Date.parse(cached.lastFetchedAt) < 60_000) return cached;
    if (!cached?.providerId || cached.source === "local") return cached;
    const connection = await this.connections.get(cached.providerId);
    const secrets = await this.connections.secrets(cached.providerId);
    if (!connection || !secrets) return cached ? { ...cached, fetchError: "disconnected" } : null;
    try {
      await this.refreshIfNeeded(connection.id);
      const fresh = await this.fetchOne(connection, secrets.accessToken, cached);
      if (options.commentsPage && fresh.group === "ISSUE" && connection.id !== "linear") {
        const comments = await this.fetchComments(connection, secrets.accessToken, fresh, options.commentsPage);
        fresh.comments = comments.comments;
        fresh.commentsHasEarlier = comments.hasEarlier;
        fresh.commentsPage = options.commentsPage;
      }
      await this.cache.put([fresh]);
      this.notifyIssues();
      return fresh;
    } catch (error) {
      const code = error instanceof ProviderHttpError ? error.code : "unreachable";
      if (cached) { await this.cache.rememberFailure(id, code); return { ...cached, fetchError: code }; }
      return null;
    }
  }

  private async fetchOne(connection: StoredConnection, token: string, current: IssueItem): Promise<IssueItem> {
    const login = connection.account?.login ?? "";
    if (connection.id === "github" || connection.id === "github-enterprise") {
      return getGithubItem(this.runtime.fetch, { token, apiBase: connection.apiBase, host: connection.host, provider: connection.id }, current.repository ?? current.projectName, current.group, String(current.numberValue ?? current.number?.replace(/^[# !]/, "")), login);
    }
    if (connection.id === "gitlab" || connection.id === "gitlab-self-hosted") {
      return getGitlabItem(this.runtime.fetch, { token, apiBase: connection.apiBase, host: connection.host, provider: connection.id }, current.repository ?? current.projectName, current.group, String(current.numberValue ?? current.number?.replace(/^[# !]/, "")), login);
    }
    return getLinearItem(this.runtime.fetch, { token }, current.number ?? current.id);
  }

  private fetchComments(connection: StoredConnection, token: string, item: IssueItem, page: number) {
    if (connection.id === "github" || connection.id === "github-enterprise") {
      return listGithubComments(this.runtime.fetch, { token, apiBase: connection.apiBase, host: connection.host, provider: connection.id }, item.repository ?? item.projectName, String(item.numberValue ?? item.number?.replace(/^#/, "")), page);
    }
    return listGitlabComments(this.runtime.fetch, { token, apiBase: connection.apiBase, host: connection.host, provider: connection.id as "gitlab" | "gitlab-self-hosted" }, item.repository ?? item.projectName, item.group, String(item.numberValue ?? item.number?.replace(/^[#!]/, "")), page);
  }

  async resolveQuery(value: string): Promise<IssueResolveResult> {
    const stored = await this.connections.list();
    const parsed = parseProviderIssueUrl(value, stored.map((item) => ({ id: item.id, host: item.host })));
    if (!parsed) return { error: "unsupported" };
    const connection = stored.find((item) => item.id === parsed.provider || (parsed.provider === "github-enterprise" && item.id === "github-enterprise" && item.host === parsed.host)
      || (parsed.provider === "gitlab-self-hosted" && item.id === "gitlab-self-hosted" && item.host === parsed.host));
    if (!connection) return { error: "disconnected" };
    const secrets = await this.connections.secrets(connection.id);
    if (!secrets) return { error: "disconnected" };
    try {
      const login = connection.account?.login ?? "";
      let item: IssueItem;
      if (connection.id === "github" || connection.id === "github-enterprise") {
        item = await getGithubItem(this.runtime.fetch, { token: secrets.accessToken, apiBase: connection.apiBase, host: connection.host, provider: connection.id }, parsed.repository ?? "", parsed.group, parsed.number, login);
      } else if (connection.id === "gitlab" || connection.id === "gitlab-self-hosted") {
        item = await getGitlabItem(this.runtime.fetch, { token: secrets.accessToken, apiBase: connection.apiBase, host: connection.host, provider: connection.id }, parsed.repository ?? "", parsed.group, parsed.number, login);
      } else {
        item = await getLinearItem(this.runtime.fetch, { token: secrets.accessToken }, parsed.number);
      }
      await this.cache.put([item]);
      this.notifyIssues();
      return { item };
    } catch (error) {
      if (error instanceof ProviderHttpError && error.code === "notFound") return { error: "notFound" };
      if (error instanceof ProviderHttpError && error.code === "forbidden") return { error: "forbidden" };
      if (error instanceof ProviderHttpError && (error.code === "tls" || error.code === "unreachable")) return { error: "unreachable" };
      return { error: "unreadable" };
    }
  }

  async listBranchPullRequests(providerId: IntegrationProviderId, repository: string, branch: string) {
    const connection = await this.connections.get(providerId);
    const secrets = await this.connections.secrets(providerId);
    if (!connection || !secrets) return [];
    const login = connection.account?.login ?? "";
    if (connection.id === "github" || connection.id === "github-enterprise") {
      return listGithubPullsForBranch(this.runtime.fetch, { token: secrets.accessToken, apiBase: connection.apiBase, host: connection.host, provider: connection.id }, repository, branch, login);
    }
    if (connection.id === "gitlab" || connection.id === "gitlab-self-hosted") {
      return listGitlabMergeRequestsForBranch(this.runtime.fetch, { token: secrets.accessToken, apiBase: connection.apiBase, host: connection.host, provider: connection.id }, repository, branch, login);
    }
    return [];
  }

  async cachedPullRequests(): Promise<IssueItem[]> {
    return (await this.cache.mine()).items.filter((item) => item.group === "PR");
  }

  /** 自动关联只认当前连接账号；平台未连接时返回 null。 */
  async viewerLoginFor(item: IssueItem): Promise<string | null> {
    if (!item.providerId) return null;
    return (await this.connections.get(item.providerId))?.account?.login ?? null;
  }

  async importLocalItems(items: IssueItem[]) {
    const locals = items.filter((item) => isIssueItem(item)).map((item) => ({ ...item, source: "local" as const, provider: item.provider ?? "本地" }));
    await this.cache.put(locals);
    this.notifyIssues();
  }
}
