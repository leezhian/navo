import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

const config = { id: "claude", enabled: true, customPath: "", args: [], environment: {} };
function fixture() {
  const calls = { installation: [], auth: [] };
  const runtime = { version: "1.0.0", auth: "signedIn", holdInstallation: null, holdAuth: null, failAuth: false, failInstallation: false };
  const load = createLoader({
    "./agentDetection": {
      detectAgentInstallation: async (input) => {
        calls.installation.push(input.id);
        const version = runtime.version;
        if (runtime.holdInstallation) await runtime.holdInstallation;
        if (runtime.failInstallation) throw new Error("probe failed");
        return { id: input.id, version, status: "installed", binaryPath: input.customPath || "/fixture/" + input.id, auth: "unknown", source: "path", actions: [] };
      },
      detectAgentAuth: async (id, binary) => {
        calls.auth.push({ id, binary });
        const auth = runtime.auth;
        if (runtime.holdAuth) await runtime.holdAuth;
        if (runtime.failAuth) throw new Error("probe failed");
        return { auth };
      },
    },
  });
  const { AgentDetectionCache, AGENT_AUTH_CACHE_TTL_MS } = load("src/main-process/services/agents/agentDetectionCache.ts");
  return { cache: new AgentDetectionCache(), calls, runtime, ttl: AGENT_AUTH_CACHE_TTL_MS };
}

test("安装结果独立缓存，账号 5 秒内复用，过期只重查账号", async (context) => {
  const { cache, calls, runtime, ttl } = fixture();
  context.mock.timers.enable({ apis: ["Date"], now: 1000 });
  await Promise.all(Array.from({ length: 8 }, () => cache.read(config, {})));
  assert.equal(calls.installation.length, 1); assert.equal(calls.auth.length, 1);
  runtime.auth = "signedOut";
  context.mock.timers.tick(ttl - 1);
  assert.equal((await cache.read(config, {})).auth, "signedIn");
  context.mock.timers.tick(1);
  assert.equal((await cache.read(config, {})).auth, "signedOut");
  assert.equal(calls.installation.length, 1); assert.equal(calls.auth.length, 2);
});

test("登录失效不清空安装结果，路径与安装失效不影响其他 Agent", async () => {
  const { cache, calls, runtime } = fixture();
  const codex = { ...config, id: "codex" };
  await cache.read(config, {}); await cache.read(codex, {});
  runtime.auth = "signedOut";
  cache.invalidate("claude", "auth");
  assert.equal((await cache.read(config, {})).auth, "signedOut");
  assert.equal(calls.installation.length, 2); assert.equal(calls.auth.length, 3);
  runtime.version = "2.0.0";
  cache.invalidate("claude");
  assert.equal((await cache.read(config, {})).version, "2.0.0");
  assert.equal((await cache.read(codex, {})).version, "1.0.0");
  assert.deepEqual(calls.installation, ["claude", "codex", "claude"]);
  assert.equal((await cache.read({ ...config, customPath: "/fixture/new" }, {})).binaryPath, "/fixture/new");
  assert.equal(calls.auth.at(-1).binary, "/fixture/new");
});

test("失效中的旧安装请求不可污染新路径或重新查询旧路径账号", async () => {
  const { cache, calls, runtime } = fixture();
  let release;
  runtime.holdInstallation = new Promise(resolve => { release = resolve; });
  const old = cache.read(config, {});
  cache.invalidate("claude");
  runtime.holdInstallation = null;
  const next = { ...config, customPath: "/fixture/new" };
  await cache.read(next, {});
  release(); await old;
  assert.equal((await cache.read(next, {})).binaryPath, "/fixture/new");
  assert.equal(calls.installation.length, 2);
  assert.deepEqual(calls.auth, [{ id: "claude", binary: "/fixture/new" }]);
});

test("登录并发合并，登录失效后迟到的旧结果不覆盖新结果", async () => {
  const { cache, calls, runtime } = fixture();
  let release;
  runtime.holdAuth = new Promise(resolve => { release = resolve; });
  const pending = Array.from({ length: 8 }, () => cache.read(config, {}));
  while (!calls.auth.length) await new Promise(resolve => setImmediate(resolve));
  cache.invalidate("claude", "auth");
  runtime.auth = "signedOut"; runtime.holdAuth = null;
  await cache.read(config, {});
  release(); await Promise.all(pending);
  assert.equal((await cache.read(config, {})).auth, "signedOut");
  assert.equal(calls.installation.length, 1); assert.equal(calls.auth.length, 2);
});

test("失败探测不会被永久缓存，账号失败不丢弃安装缓存", async () => {
  const { cache, calls, runtime } = fixture();
  runtime.failInstallation = true;
  await assert.rejects(cache.read(config, {}), /probe failed/);
  runtime.failInstallation = false; runtime.failAuth = true;
  await assert.rejects(cache.read(config, {}), /probe failed/);
  runtime.failAuth = false;
  assert.equal((await cache.read(config, {})).auth, "signedIn");
  assert.equal(calls.installation.length, 2); assert.equal(calls.auth.length, 2);
});
