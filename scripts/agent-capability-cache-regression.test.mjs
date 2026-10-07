import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import os from "node:os";
import { createLoader } from "./helpers/load-typescript.mjs";

const capabilities = (agentId, model = "live-model") => ({ agentId, models: [{ id: model, name: model, efforts: ["low", "high"], defaultEffort: "low" }], modes: [{ id: "default", name: "default" }], defaultModelId: model, defaultModeId: "default" });
const configuration = { id: "claude", enabled: true, customPath: "", args: [], environment: [] };

async function fixture(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-capability-cache-"));
  const filename = path.join(directory, "app.db");
  const runtime = { version: "1.0.0", auth: "signedIn", identity: "first@example.invalid", binaryPath: "/fixture/cli", fail: false, probes: 0, detections: 0, hold: null, model: "live-model" };
  const load = createLoader({ electron: { safeStorage: { isEncryptionAvailable: () => true } },
    "./agentEnvironment": { agentShellEnvironment: async () => ({ HOME: directory }), isAgentExecutable: async () => true },
    "./agentDetection": { detectAgent: async (config) => { runtime.detections += 1; return { id: config.id, status: "installed", auth: runtime.auth, identity: runtime.identity, version: runtime.version, binaryPath: config.customPath || runtime.binaryPath, source: "path", actions: [] }; } },
    "./agentCapabilities": { readAgentCapabilities: async (id) => { runtime.probes += 1; const model = runtime.model; if (runtime.hold) await runtime.hold; if (runtime.fail) throw new Error("PRIVATE CLI OUTPUT"); return capabilities(id, model); } },
    "../terminal/terminalService": {},
  });
  const { AgentService } = load("src/main-process/services/agents/agentService.ts");
  let notifications = 0;
  const service = new AgentService(filename, () => { notifications += 1; });
  context.after(async () => { await service.capabilityCache.stop(); await rm(directory, { recursive: true, force: true }); });
  return { directory, filename, runtime, load, service, notifications: () => notifications, AgentService };
}

test("SQLite 升级保留配置；缓存跨重启，读快照和创建校验不检测 CLI", async (context) => {
  const { service, filename, runtime, AgentService } = await fixture(context);
  const first = await service.capabilityCache.snapshot();
  assert.equal(first.entries.claude.pending, true);
  assert.equal(runtime.detections, 0);
  await service.capabilityCache.refresh("claude");
  assert.equal(runtime.probes, 1);
  const restarted = new AgentService(filename);
  context.after(() => restarted.capabilityCache.stop());
  for (let index = 0; index < 5; index += 1) {
    const snapshot = await restarted.capabilityCache.snapshot();
    assert.equal(snapshot.entries.claude.capabilities.defaultModelId, "live-model");
    assert.equal(snapshot.entries.claude.pending, false);
    assert.equal((await restarted.capabilities("claude")).defaultModelId, "live-model");
  }
  assert.equal(runtime.detections, 1); assert.equal(runtime.probes, 1);
  const database = new DatabaseSync(filename);
  assert.equal(database.prepare("PRAGMA user_version").get().user_version, 10);
  const data = database.prepare("SELECT data FROM agent_capability_cache").get().data;
  assert.ok(!data.includes(runtime.identity));
  assert.ok(!database.prepare("SELECT data FROM agent_capability_state").get().data.includes(runtime.identity));
  database.close();
});

test("v7 数据库新增缓存表，不改动已有设置和任务 Agent 配置", async (context) => {
  const { filename, load, service } = await fixture(context);
  const database = await load("src/main-process/services/appDatabase.ts").openAppDatabase(filename);
  database.prepare("INSERT INTO settings VALUES ('theme',?)").run('"dark"');
  database.prepare("INSERT INTO agent_preferences VALUES ('defaultAgent',?)").run('"claude"');
  database.exec("DROP TABLE agent_capability_cache; DROP TABLE agent_capability_state; PRAGMA user_version=7");
  database.close();
  assert.equal((await service.capabilityCache.snapshot()).settings.defaultAgent, "claude");
  const upgraded = new DatabaseSync(filename);
  assert.equal(upgraded.prepare("PRAGMA user_version").get().user_version, 10);
  assert.equal(upgraded.prepare("SELECT value FROM settings WHERE key='theme'").get().value, '"dark"');
  assert.equal(upgraded.prepare("SELECT count(*) AS count FROM agent_capability_cache").get().count, 0);
  upgraded.close();
});

test("明确退出登录不可使用旧缓存，禁用后不再后台探测", async (context) => {
  const { service, runtime } = await fixture(context);
  await service.capabilityCache.refresh("claude");
  runtime.auth = "signedOut";
  await service.capabilityCache.refresh("claude");
  await assert.rejects(service.capabilities("claude"), /AGENT_UNAVAILABLE/);
  assert.equal((await service.capabilityCache.snapshot()).entries.claude.capabilities.defaultModelId, "live-model");
  await service.save({ ...configuration, enabled: false });
  await service.capabilityCache.refresh("claude");
  const detections = runtime.detections;
  await service.capabilityCache.refresh("claude");
  assert.equal(runtime.detections, detections); assert.equal(runtime.probes, 1);
});

test("相同 Agent 的并发刷新合并；新鲜缓存不重复查询，过期才刷新", async (context) => {
  const { service, runtime, filename, AgentService } = await fixture(context);
  await Promise.all(Array.from({ length: 8 }, () => service.capabilityCache.refresh("claude")));
  assert.equal(runtime.detections, 1); assert.equal(runtime.probes, 1);
  await service.capabilityCache.refresh("claude");
  assert.equal(runtime.probes, 1);
  const database = new DatabaseSync(filename);
  const row = JSON.parse(database.prepare("SELECT data FROM agent_capability_cache").get().data);
  row.updatedAt -= 4 * 60 * 60 * 1000;
  database.prepare("UPDATE agent_capability_cache SET data=?").run(JSON.stringify(row)); database.close();
  const restarted = new AgentService(filename); context.after(() => restarted.capabilityCache.stop());
  await restarted.capabilityCache.snapshot();
  assert.equal(runtime.probes, 1);
  await restarted.capabilityCache.refresh("claude");
  assert.equal(runtime.probes, 2);
});

test("路径、版本、账号和凭证文件变化使缓存失效；失败不删除上次结果", async (context) => {
  const { service, runtime, directory } = await fixture(context);
  await service.capabilityCache.refresh("claude");
  runtime.version = "2.0.0";
  await service.capabilityCache.refresh("claude"); assert.equal(runtime.probes, 2);
  runtime.identity = "second@example.invalid";
  await service.capabilityCache.refresh("claude"); assert.equal(runtime.probes, 3);
  await mkdir(path.join(directory, ".claude"));
  await writeFile(path.join(directory, ".claude/.credentials.json"), "PRIVATE");
  await service.capabilityCache.refresh("claude"); assert.equal(runtime.probes, 4);
  runtime.fail = true;
  await service.save({ ...configuration, customPath: "/fixture/other-cli" });
  await service.capabilityCache.refresh("claude");
  let snapshot = await service.capabilityCache.snapshot();
  assert.equal(snapshot.entries.claude.capabilities.defaultModelId, "live-model");
  assert.equal(snapshot.entries.claude.error, "AGENT_CAPABILITIES_FAILED");
  assert.ok(!JSON.stringify(snapshot).includes("PRIVATE"));
  runtime.fail = false;
  await service.capabilityCache.refresh("claude");
  snapshot = await service.capabilityCache.snapshot();
  assert.equal(snapshot.entries.claude.error, null); assert.equal(snapshot.entries.claude.pending, false);
});

test("过期刷新失败仍可使用同一环境的最后成功结果，且不延长过期时间", async (context) => {
  const { service, runtime, filename, AgentService } = await fixture(context);
  await service.capabilityCache.refresh("claude");
  const database = new DatabaseSync(filename);
  const row = JSON.parse(database.prepare("SELECT data FROM agent_capability_cache").get().data);
  row.updatedAt = 1;
  database.prepare("UPDATE agent_capability_cache SET data=?").run(JSON.stringify(row)); database.close();
  const restarted = new AgentService(filename); context.after(() => restarted.capabilityCache.stop());
  runtime.fail = true;
  await restarted.capabilityCache.refresh("claude");
  assert.equal((await restarted.capabilities("claude")).defaultModelId, "live-model");
  const stored = new DatabaseSync(filename);
  assert.equal(JSON.parse(stored.prepare("SELECT data FROM agent_capability_cache").get().data).updatedAt, 1); stored.close();
});

test("登录管理使不可识别账号的旧缓存失效，失败后仍须重新探测才可恢复", async (context) => {
  const { service, runtime } = await fixture(context);
  runtime.auth = "unknown"; runtime.identity = undefined;
  await service.capabilityCache.refresh("antigravity");
  runtime.fail = true;
  await service.capabilityCache.invalidate("antigravity");
  await service.capabilityCache.refresh("antigravity");
  await assert.rejects(service.capabilities("antigravity"), /AGENT_CAPABILITIES_FAILED/);
  runtime.fail = false; runtime.model = "other-account-model";
  await service.capabilityCache.refresh("antigravity");
  assert.equal(runtime.probes, 3);
  assert.equal((await service.capabilities("antigravity")).defaultModelId, "other-account-model");
});

test("配置变更时旧探测不可写回，并在并发请求结束后自动探测新配置", async (context) => {
  const { service, runtime } = await fixture(context);
  let release;
  runtime.hold = new Promise((resolve) => { release = resolve; });
  const old = service.capabilityCache.refresh("claude");
  while (!runtime.probes) await new Promise((resolve) => setImmediate(resolve));
  runtime.model = "new-model";
  await service.save({ ...configuration, customPath: "/fixture/new-cli" });
  runtime.hold = null; release(); await old;
  assert.equal(runtime.probes, 2);
  assert.equal((await service.capabilities("claude")).defaultModelId, "new-model");
});

test("启动 30 秒后检查，此后每 4 小时检查，停止后不再调度", async (context) => {
  const { service, load } = await fixture(context);
  const { AGENT_CACHE_MAX_AGE_MS, AGENT_CACHE_START_DELAY_MS } = load("src/main-process/services/agents/agentCapabilityCache.ts");
  context.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let checks = 0;
  service.capabilityCache.refreshAll = async () => { checks += 1; };
  service.capabilityCache.start(); service.capabilityCache.start();
  context.mock.timers.tick(AGENT_CACHE_START_DELAY_MS - 1); assert.equal(checks, 0);
  context.mock.timers.tick(1); assert.equal(checks, 1);
  context.mock.timers.tick(AGENT_CACHE_MAX_AGE_MS - AGENT_CACHE_START_DELAY_MS); assert.equal(checks, 2);
  await service.capabilityCache.stop();
  context.mock.timers.tick(AGENT_CACHE_MAX_AGE_MS * 2); assert.equal(checks, 2);
});
