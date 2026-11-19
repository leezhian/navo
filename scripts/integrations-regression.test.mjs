import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const cipher = { available: () => true, encrypt: (value) => "enc:" + Buffer.from(value).toString("base64"), decrypt: (value) => Buffer.from(value.slice(4), "base64").toString() };

test("GitHub 设备码：申请、等待、拒绝、过期与成功", async () => {
  const flow = load("src/main-process/services/integrations/githubDeviceFlow.ts");
  const start = await flow.requestGithubDeviceCode(async (url, init) => {
    assert.match(url, /login\/device\/code$/);
    assert.ok(!String(init.body).includes("secret"));
    assert.deepEqual(JSON.parse(String(init.body)), { client_id: "Ov23liJXHo8fBZzJ6hm9", scope: "repo read:user" });
    return json({ device_code: "d", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 });
  }, { clientId: "Ov23liJXHo8fBZzJ6hm9", scope: "repo read:user" });
  assert.equal(start.userCode, "ABCD-1234");
  const poll = (body) => flow.pollGithubDeviceToken(async () => json(body), { clientId: "x", deviceCode: "d" });
  assert.equal((await poll({ error: "authorization_pending" })).status, "pending");
  assert.equal((await poll({ error: "access_denied" })).status, "denied");
  assert.equal((await poll({ error: "expired_token" })).status, "expired");
  assert.equal((await poll({ access_token: "gho_x", token_type: "bearer" })).status, "success");
});

test("内置 GitHub client id，可被环境变量覆盖；GitLab/Linear 内置 client id，可被环境变量覆盖", () => {
  const clients = load("src/main-process/services/integrations/oauthClients.ts");
  delete process.env.NAVO_GITHUB_OAUTH_CLIENT_ID;
  assert.equal(clients.oauthClientId("github"), "Ov23liJXHo8fBZzJ6hm9");
  process.env.NAVO_GITHUB_OAUTH_CLIENT_ID = "override";
  assert.equal(clients.oauthClientId("github"), "override");
  delete process.env.NAVO_GITHUB_OAUTH_CLIENT_ID;
  assert.equal(clients.oauthClientId("linear"), "63078eb39b9fff45aa075ac633f5cfa0");
  assert.equal(clients.oauthAvailable("linear"), true);
  process.env.NAVO_LINEAR_OAUTH_CLIENT_ID = "linear-override";
  assert.equal(clients.oauthClientId("linear"), "linear-override");
  delete process.env.NAVO_LINEAR_OAUTH_CLIENT_ID;
  assert.equal(clients.oauthClientId("gitlab"), "b880924bedac9d391abdc1e7a4f1224ee8f39b53d1f2165b5aa368febe20a231");
  assert.equal(clients.oauthAvailable("gitlab"), true);
  process.env.NAVO_GITLAB_OAUTH_CLIENT_ID = "gitlab-override";
  assert.equal(clients.oauthClientId("gitlab"), "gitlab-override");
  delete process.env.NAVO_GITLAB_OAUTH_CLIENT_ID;
});

test("GitLab 与 Linear 的浏览器回调使用固定回环地址", () => {
  const { OAUTH_LOOPBACK_PORT, OAUTH_LOOPBACK_REDIRECT_URI } = load("src/main-process/services/integrations/pkceOAuth.ts");
  assert.equal(OAUTH_LOOPBACK_PORT, 58764);
  assert.equal(OAUTH_LOOPBACK_REDIRECT_URI, "http://127.0.0.1:58764/callback");
});

test("链接识别：GitHub、GitLab MR、Linear 编号；普通链接不识别", () => {
  const { parseProviderIssueUrl } = load("src/main-process/services/integrations/issueIdentity.ts");
  assert.equal(parseProviderIssueUrl("https://github.com/a/b/pull/12")?.group, "PR");
  assert.equal(parseProviderIssueUrl("https://github.com/a/b/issues/3")?.group, "ISSUE");
  assert.equal(parseProviderIssueUrl("https://gitlab.com/g/p/-/merge_requests/4")?.group, "PR");
  assert.equal(parseProviderIssueUrl("ENG-12")?.provider, "linear");
  assert.equal(parseProviderIssueUrl("https://example.com/blog"), null);
});

test("自动关联只挑自己的未关闭 PR、精确分支与同仓库，并尊重手动解除", () => {
  const { matchingAutolinkPullRequests } = load("src/main-process/services/integrations/autolink.ts");
  const pr = (over) => ({ id: "p", group: "PR", title: "t", projectName: "b", status: "review", date: "2026-01-01", url: "https://github.com/a/b/pull/1", headBranch: "feat/x", author: { login: "kim" }, ...over });
  const worktrees = [{ taskId: "t1", resourceId: "r1", name: "b", workingPath: "/w", branch: "feat/x", remoteUrl: "git@github.com:a/b.git" }];
  assert.equal(matchingAutolinkPullRequests([pr()], worktrees, "kim", new Set()).length, 1);
  assert.equal(matchingAutolinkPullRequests([pr({ author: { login: "other" } })], worktrees, "kim", new Set()).length, 0);
  assert.equal(matchingAutolinkPullRequests([pr({ status: "merged" })], worktrees, "kim", new Set()).length, 0);
  assert.equal(matchingAutolinkPullRequests([pr({ headBranch: "feat/x2" })], worktrees, "kim", new Set()).length, 0);
  assert.equal(matchingAutolinkPullRequests([pr({ url: "https://github.com/fork/b/pull/1" })], worktrees, "kim", new Set()).length, 0);
  assert.equal(matchingAutolinkPullRequests([pr()], worktrees, "kim", new Set(["t1:p"])).length, 0);
});

test("token 连接：通过校验保存加密凭据，拒绝时不保存，断开删除凭据", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-integrations-"));
  try {
    const { IntegrationService } = load("src/main-process/services/integrations/integrationService.ts");
    let reject = false;
    let scopesHeader = "repo, read:user";
    const service = new IntegrationService({
      filename: path.join(directory, "app.db"), cipher, openExternal: async () => undefined,
      fetch: async (url) => reject ? json({ message: "bad" }, 401) : json({ login: "kim", name: "Kim", avatar_url: "" }, 200, { "x-oauth-scopes": scopesHeader }),
    });
    const result = await service.connect({ id: "github", method: "pat", token: "ghp_secret" });
    assert.equal(result.check, "verified");
    const status = (await service.listStatuses()).find((item) => item.id === "github");
    assert.equal(status.connected, true);
    assert.equal(status.account.login, "kim");
    assert.deepEqual(status.missingScopes, []);
    assert.ok(!JSON.stringify(await service.listStatuses()).includes("ghp_secret"));
    scopesHeader = "read:user";
    await service.connect({ id: "github", method: "pat", token: "ghp_limited" });
    assert.deepEqual((await service.listStatuses()).find((item) => item.id === "github").missingScopes, ["repo"]);
    scopesHeader = "";
    await service.connect({ id: "github", method: "pat", token: "ghp_empty" });
    assert.deepEqual((await service.listStatuses()).find((item) => item.id === "github").missingScopes, []);
    await service.refreshStatuses();
    assert.deepEqual((await service.listStatuses()).find((item) => item.id === "github").missingScopes, []);
    await service.connect({ id: "github-enterprise", method: "pat", token: "ghp_empty", host: "https://ghe.example.com" });
    assert.deepEqual((await service.listStatuses()).find((item) => item.id === "github-enterprise").missingScopes, []);
    scopesHeader = "repo, read:user";
    reject = true;
    await assert.rejects(service.connect({ id: "gitlab", method: "pat", token: "glpat" }), /INTEGRATION_TOKEN_REJECTED/);
    assert.equal((await service.listStatuses()).find((item) => item.id === "gitlab").connected, false);
    await assert.rejects(service.connect({ id: "gitlab-self-hosted", method: "pat", token: "x", host: "https://user:pw@git.example.com" }), /INTEGRATION_INVALID_HOST/);
    await service.disconnect("github");
    assert.equal((await service.listStatuses()).find((item) => item.id === "github").connected, false);
    assert.equal(await service.connections.secrets("github"), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("GitLab 只申请 read_api 与 read_user，api 视为已满足 read_api", () => {
  const { INTEGRATION_REQUIRED_SCOPES } = load("src/shared/integrationTypes.ts");
  assert.deepEqual(INTEGRATION_REQUIRED_SCOPES.github, ["repo", "read:user"]);
  assert.deepEqual(INTEGRATION_REQUIRED_SCOPES["github-enterprise"], ["repo", "read:user"]);
  assert.deepEqual(INTEGRATION_REQUIRED_SCOPES.gitlab, ["read_api", "read_user"]);
  assert.deepEqual(INTEGRATION_REQUIRED_SCOPES["gitlab-self-hosted"], ["read_api", "read_user"]);
  assert.ok(!INTEGRATION_REQUIRED_SCOPES.gitlab.includes("api"));
});

test("GitHub 设备码自动续期：双 token 加密、原子写入、并发合并、失败标过期", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-github-refresh-"));
  try {
    const { IntegrationService } = load("src/main-process/services/integrations/integrationService.ts");
    let refreshCalls = 0;
    const service = new IntegrationService({
      filename: path.join(directory, "app.db"), cipher, openExternal: async () => undefined, now: () => Date.parse("2026-11-16T06:00:00.000Z"),
      fetch: async (url, init) => {
        if (String(url).includes("/user") && !String(url).includes("oauth")) return json({ login: "kim", name: "Kim", avatar_url: "" }, 200, { "x-oauth-scopes": "repo, read:user" });
        if (String(url).includes("login/oauth/access_token") && String(init?.body || "").includes("refresh_token")) {
          refreshCalls += 1;
          assert.ok(!String(init?.body || "").includes("secret"));
          await new Promise((resolve) => setTimeout(resolve, 30));
          return json({ access_token: "ghu_new", refresh_token: "ghr_new", expires_in: 28800, scope: "repo,read:user" });
        }
        return json({ message: "unexpected" }, 500);
      },
    });
    await service.connections.save({
      id: "github", authMethod: "oauth", host: "github.com", apiBase: "https://api.github.com",
      account: { login: "kim" }, scopes: [], missingScopes: [], expiresAt: "2026-11-16T05:59:30.000Z",
    }, { accessToken: "ghu_old", refreshToken: "ghr_old" });
    await Promise.all([service.refreshStatuses(), service.refreshStatuses()]);
    assert.equal(refreshCalls, 1);
    const secrets = await service.connections.secrets("github");
    assert.equal(secrets.accessToken, "ghu_new");
    assert.equal(secrets.refreshToken, "ghr_new");
    const { DatabaseSync: database } = await import("node:sqlite");
    const db = new database(path.join(directory, "app.db"));
    try {
      const row = db.prepare("SELECT access_token,refresh_token FROM integration_secrets WHERE id=?").get("github");
      assert.ok(String(row.access_token).startsWith("enc:"));
      assert.ok(String(row.refresh_token).startsWith("enc:"));
      assert.ok(!String(row.access_token).includes("ghu_"));
      assert.ok(!String(row.refresh_token).includes("ghr_"));
    } finally { db.close(); }
    const connection = await service.connections.get("github");
    assert.equal(connection.warning, undefined);
    assert.ok(Date.parse(connection.expiresAt) > Date.parse("2026-11-16T06:00:00.000Z"));

    // 续期失败 → 登录已过期
    const failing = new IntegrationService({
      filename: path.join(directory, "fail.db"), cipher, openExternal: async () => undefined, now: () => Date.parse("2026-11-16T06:00:00.000Z"),
      fetch: async () => json({ error: "bad_refresh_token" }, 401),
    });
    await failing.connections.save({
      id: "github", authMethod: "oauth", host: "github.com", apiBase: "https://api.github.com",
      account: { login: "kim" }, scopes: [], missingScopes: [], expiresAt: "2026-11-16T05:59:30.000Z",
    }, { accessToken: "ghu_old", refreshToken: "ghr_old" });
    await failing.refreshStatuses();
    assert.equal((await failing.connections.get("github")).warning, "expired");
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("GitHub OAuth App 设备码请求 repo read:user，有 refresh 则续期，没有则视为长期 token", async () => {
  delete process.env.NAVO_GITHUB_OAUTH_CLIENT_ID;
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-github-oauth-app-"));
  const waitUntil = async (fn) => {
    for (let i = 0; i < 80; i++) {
      const value = await fn();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error("timed out waiting for GitHub device auth");
  };
  try {
    const { IntegrationService } = load("src/main-process/services/integrations/integrationService.ts");
    const durable = new IntegrationService({
      filename: path.join(directory, "durable.db"), cipher, openExternal: async () => undefined, sleep: async () => undefined,
      now: () => Date.parse("2026-11-16T06:00:00.000Z"),
      fetch: async (url, init) => {
        if (String(url).includes("login/device/code")) {
          assert.match(String(url), /https:\/\/github.com\/login\/device\/code$/);
          assert.ok(!String(init.body).includes("secret"));
          assert.deepEqual(JSON.parse(String(init.body)), { client_id: "Ov23liJXHo8fBZzJ6hm9", scope: "repo read:user" });
          return json({ device_code: "d", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 });
        }
        if (String(url).includes("login/oauth/access_token")) {
          assert.match(String(url), /https:\/\/github.com\/login\/oauth\/access_token$/);
          assert.ok(!String(init.body).includes("secret"));
          return json({ access_token: "gho_x", token_type: "bearer", scope: "repo,read:user" });
        }
        if (String(url).includes("/user")) return json({ login: "kim", name: "Kim", avatar_url: "" }, 200, { "x-oauth-scopes": "repo, read:user" });
        return json({ message: "unexpected" }, 500);
      },
    });
    const session = await durable.connect({ id: "github", method: "oauth" });
    assert.equal(session.kind, "device");
    const status = await waitUntil(async () => {
      const item = (await durable.listStatuses()).find((entry) => entry.id === "github");
      return item?.connected ? item : null;
    });
    assert.deepEqual(status.missingScopes, []);
    assert.equal(status.warning, undefined);
    const connection = await durable.connections.get("github");
    assert.equal(connection.expiresAt, undefined);
    const secrets = await durable.connections.secrets("github");
    assert.equal(secrets.accessToken, "gho_x");
    assert.equal(secrets.refreshToken, undefined);
    let tokenHits = 0;
    const stillDurable = new IntegrationService({
      filename: path.join(directory, "durable.db"), cipher, openExternal: async () => undefined,
      now: () => Date.parse("2026-11-16T10:00:00.000Z"),
      fetch: async (url) => {
        if (String(url).includes("login/oauth/access_token")) { tokenHits += 1; return json({ error: "should_not_refresh" }, 500); }
        if (String(url).includes("/user")) return json({ login: "kim", name: "Kim", avatar_url: "" }, 200, { "x-oauth-scopes": "repo, read:user" });
        return json({ message: "unexpected" }, 500);
      },
    });
    await stillDurable.refreshStatuses();
    assert.equal(tokenHits, 0);
    assert.equal((await stillDurable.connections.get("github")).warning, undefined);
    assert.equal((await stillDurable.connections.get("github")).expiresAt, undefined);

    const expiring = new IntegrationService({
      filename: path.join(directory, "expiring.db"), cipher, openExternal: async () => undefined, sleep: async () => undefined,
      now: () => Date.parse("2026-11-16T06:00:00.000Z"),
      fetch: async (url, init) => {
        if (String(url).includes("login/device/code")) {
          assert.deepEqual(JSON.parse(String(init.body)), { client_id: "Ov23liJXHo8fBZzJ6hm9", scope: "repo read:user" });
          return json({ device_code: "d", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 });
        }
        if (String(url).includes("login/oauth/access_token")) {
          return json({ access_token: "gho_old", refresh_token: "ghr_old", expires_in: 28800, token_type: "bearer", scope: "repo read:user" });
        }
        if (String(url).includes("/user")) return json({ login: "kim", name: "Kim", avatar_url: "" }, 200, { "x-oauth-scopes": "repo, read:user" });
        return json({ message: "unexpected" }, 500);
      },
    });
    await expiring.connect({ id: "github", method: "oauth" });
    const expiringStatus = await waitUntil(async () => {
      const item = (await expiring.listStatuses()).find((entry) => entry.id === "github");
      return item?.connected ? item : null;
    });
    assert.deepEqual(expiringStatus.missingScopes, []);
    const expiringConnection = await expiring.connections.get("github");
    assert.equal(expiringConnection.expiresAt, "2026-11-16T14:00:00.000Z");
    assert.equal((await expiring.connections.secrets("github")).refreshToken, "ghr_old");

    const emptyOauth = new IntegrationService({
      filename: path.join(directory, "empty-oauth.db"), cipher, openExternal: async () => undefined, sleep: async () => undefined,
      now: () => Date.parse("2026-11-16T06:00:00.000Z"),
      fetch: async (url, init) => {
        if (String(url).includes("login/device/code")) {
          return json({ device_code: "d", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 });
        }
        if (String(url).includes("login/oauth/access_token")) {
          return json({ access_token: "gho_empty", token_type: "bearer", scope: "" });
        }
        if (String(url).includes("/user")) return json({ login: "kim", name: "Kim", avatar_url: "" }, 200, { "x-oauth-scopes": "" });
        return json({ message: "unexpected" }, 500);
      },
    });
    await emptyOauth.connect({ id: "github", method: "oauth" });
    const emptyStatus = await waitUntil(async () => {
      const item = (await emptyOauth.listStatuses()).find((entry) => entry.id === "github");
      return item?.connected ? item : null;
    });
    assert.deepEqual(emptyStatus.missingScopes, ["repo", "read:user"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("Linear 换票若要求 client secret，则提示改用 API key，不保存密钥", async () => {
  const { exchangeAuthorizationCode } = load("src/main-process/services/integrations/pkceOAuth.ts");
  await assert.rejects(
    exchangeAuthorizationCode(async () => json({ error: "invalid_client", error_description: "client_secret is required" }, 401), {
      tokenUrl: "https://api.linear.app/oauth/token", clientId: "x", code: "c", redirectUri: "http://127.0.0.1:58764/callback", verifier: "v",
    }),
    /INTEGRATION_OAUTH_SECRET_REQUIRED/,
  );
});

test("回环 PKCE：端口占用立即失败、校验一次性 state、仅接受 GET /callback，并在回调/取消/超时后关闭", async () => {
  const http = await import("node:http");
  const { startLoopbackListener, timingSafeEqualText, OAUTH_LOOPBACK_TIMEOUT_MS, OAUTH_LOOPBACK_REDIRECT_URI, createOAuthState } = load("src/main-process/services/integrations/pkceOAuth.ts");
  assert.equal(OAUTH_LOOPBACK_TIMEOUT_MS, 5 * 60_000);
  assert.equal(OAUTH_LOOPBACK_REDIRECT_URI, "http://127.0.0.1:58764/callback");
  const state = createOAuthState();
  assert.equal(state.length, 32);
  assert.match(state, /^[0-9a-f]+$/);
  assert.equal(timingSafeEqualText(state, state), true);
  assert.equal(timingSafeEqualText(state, "0".repeat(32)), false);
  assert.equal(timingSafeEqualText("ab", "abc"), false);

  const occupy = async (port) => {
    const server = http.createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    return server;
  };
  const portFree = async (port) => {
    const started = Date.now();
    while (Date.now() - started < 2000) {
      const probe = http.createServer();
      try {
        await new Promise((resolve, reject) => {
          probe.once("error", reject);
          probe.listen(port, "127.0.0.1", resolve);
        });
        await new Promise((resolve) => probe.close(() => resolve()));
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    throw new Error("port still bound");
  };

  const blocker = await occupy(0);
  const busyPort = blocker.address().port;
  const started = Date.now();
  await assert.rejects(
    startLoopbackListener({ expectedState: state, successHtml: "ok", failureHtml: "no", port: busyPort, timeoutMs: 5000 }),
    /INTEGRATION_AUTH_PORT_BUSY/,
  );
  assert.ok(Date.now() - started < 1000, "port-busy must fail immediately");
  await new Promise((resolve) => blocker.close(() => resolve()));

  const pages = { successHtml: "ok", failureHtml: "no" };
  const listener = await startLoopbackListener({ expectedState: state, ...pages, port: 0, timeoutMs: 5000 });
  const mismatchResult = assert.rejects(listener.result, /INTEGRATION_AUTH_FAILED/);
  const denied = await fetch(`${listener.redirectUri.replace("/callback", "/other")}`);
  assert.equal(denied.status, 404);
  const posted = await fetch(`${listener.redirectUri}?code=SHOULD_NOT_EXCHANGE&state=${state}`, { method: "POST" });
  assert.equal(posted.status, 405);
  const mismatch = await fetch(`${listener.redirectUri}?code=SHOULD_NOT_EXCHANGE&state=${"0".repeat(32)}`);
  assert.equal(mismatch.status, 400);
  await mismatchResult;
  await portFree(listener.port);

  const ok = await startLoopbackListener({ expectedState: state, ...pages, port: 0, timeoutMs: 5000 });
  const first = await fetch(`${ok.redirectUri}?code=good-code&state=${state}`);
  assert.equal(first.status, 200);
  const result = await ok.result;
  assert.equal(result.code, "good-code");
  await assert.rejects(fetch(`${ok.redirectUri}?code=second&state=${state}`));
  await portFree(ok.port);

  const cancelled = await startLoopbackListener({ expectedState: state, ...pages, port: 0, timeoutMs: 5000 });
  const cancelledResult = assert.rejects(cancelled.result, /INTEGRATION_AUTH_CANCELLED/);
  await cancelled.close();
  await cancelledResult;
  await portFree(cancelled.port);

  const expired = await startLoopbackListener({ expectedState: state, ...pages, port: 0, timeoutMs: 50 });
  await assert.rejects(expired.result, /INTEGRATION_AUTH_EXPIRED/);
  await portFree(expired.port);
});

test("正文笔记只生成一次，本地条目不生成", () => {
  const { buildIssueBodyNote, existingIssueNote, issueNoteMarker } = load("src/main-process/services/integrations/issueBodyNote.ts");
  const issue = { id: "iss-1", group: "ISSUE", title: "Fix", number: "#1", status: "todo", projectName: "p", date: "2026-11-16", source: "remote", body: "hello", url: "https://github.com/a/b/issues/1" };
  const first = buildIssueBodyNote(issue, []);
  assert.ok(first);
  assert.ok(first.content.includes(issueNoteMarker(issue.id)));
  assert.equal(buildIssueBodyNote(issue, [{ content: first.content }]), null);
  assert.equal(existingIssueNote([{ content: first.content }], issue.id), true);
  assert.equal(buildIssueBodyNote({ ...issue, source: "local" }, []), null);
});

test("GitHub GraphQL 用 merged 映射已合并 PR；查询失败记状态和 errors，界面仍为 unreadable", async () => {
  const { listGithubMine } = load("src/main-process/services/integrations/githubClient.ts");
  const { makeDiagnosticEntry } = load("src/main-process/diagnostics/diagnosticSanitizer.ts");
  const connection = { token: "gho_x", apiBase: "https://api.github.com", host: "github.com", provider: "github" };
  const listed = await listGithubMine(async (url, init) => {
    assert.match(String(url), /graphql$/);
    const body = JSON.parse(String(init.body));
    assert.match(body.query, /\bmerged\b/);
    assert.doesNotMatch(body.query, /isMerged/);
    assert.doesNotMatch(body.query, /author\{login name/);
    assert.match(body.query, /author\{login avatarUrl \.\.\.on User\{name\}\}/);
    assert.doesNotMatch(body.variables.q, /@me/);
    assert.match(body.variables.q, /author:kim/);
    return json({
      data: {
        search: {
          pageInfo: { hasNextPage: false },
          nodes: [{
            __typename: "PullRequest",
            number: 12,
            title: "Done",
            url: "https://github.com/a/b/pull/12",
            state: "MERGED",
            isDraft: false,
            merged: true,
            repository: { nameWithOwner: "a/b" },
            author: { login: "kim" },
            updatedAt: "2026-11-16T00:00:00.000Z",
          }],
        },
      },
    });
  }, connection, "kim");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].status, "merged");
  assert.equal(listed[0].nativeStatus, "Merged");
  assert.equal(listed[0].number, "#12");

  const failure = listGithubMine(async () => json({
    errors: [{ type: "GRAPHQL_VALIDATION_FAILED", message: "Field 'isMerged' doesn't exist on type 'PullRequest'" }],
  }), connection, "kim");
  await assert.rejects(failure, (error) => error.code === "unreadable");

  const marker = "gho_not_for_logs";
  const entry = makeDiagnosticEntry("integration.fetch.failed", {
    providerId: "github",
    httpStatus: 200,
    graphqlErrors: [
      { type: "GRAPHQL_VALIDATION_FAILED", message: "Field 'isMerged' doesn't exist on type 'PullRequest'" },
      { type: "INVALID", message: "token " + marker + " leaked" },
    ],
  });
  assert.equal(entry.event, "integration.fetch.failed");
  assert.equal(entry.data.providerId, "github");
  assert.equal(entry.data.httpStatus, 200);
  assert.equal(entry.data.graphqlErrors[0].type, "GRAPHQL_VALIDATION_FAILED");
  assert.equal(entry.data.graphqlErrors[0].message, "Field 'isMerged' doesn't exist on type 'PullRequest'");
  assert.equal(entry.data.graphqlErrors[1].message.includes("[redacted]"), true);
  assert.equal(JSON.stringify(entry).includes(marker), false);
});

test("GitHub 列表空结果记 integration.fetch.succeeded，只含平台和 count", () => {
  const { makeDiagnosticEntry } = load("src/main-process/diagnostics/diagnosticSanitizer.ts");
  const entry = makeDiagnosticEntry("integration.fetch.succeeded", { providerId: "github", count: 0 });
  assert.equal(entry.event, "integration.fetch.succeeded");
  assert.equal(entry.data.providerId, "github");
  assert.equal(entry.data.count, 0);
  assert.equal(entry.data.graphqlErrors, undefined);
});
