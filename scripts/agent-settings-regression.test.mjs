import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, realpath, rm, chmod } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

async function fixture(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-agents-test-"));
  const cleanups = [];
  context.after(async () => { for (const cleanup of cleanups) await cleanup(); await rm(directory, { recursive: true, force: true }); });
  let encryption = true;
  const safeStorage = {
    isEncryptionAvailable: () => encryption,
    getSelectedStorageBackend: () => "keychain",
    encryptString: (value) => Buffer.from(value).reverse(),
    decryptString: (value) => Buffer.from(value).reverse().toString(),
  };
  const load = createLoader({ electron: { safeStorage } });
  const { AgentRepository } = load("src/main-process/services/agents/agentRepository.ts");
  const filename = path.join(directory, "app.db");
  return { directory, filename, safeStorage, load, cleanups, repository: new AgentRepository(filename), disableEncryption: () => { encryption = false; } };
}

const config = { id: "claude", enabled: true, customPath: "", args: ["--model", "a model with spaces"], environment: [] };

test("Agent SQLite 升级保留原设置，只包含四种 CLI 并独立持久化默认选择", async (context) => {
  const { repository, filename, load } = await fixture(context);
  const old = await load("src/main-process/services/appDatabase.ts").openAppDatabase(filename);
  old.prepare("INSERT INTO settings VALUES ('theme',?)").run('"dark"');
  old.exec("DROP TABLE agent_configurations; DROP TABLE agent_preferences; PRAGMA user_version=5"); old.close();
  assert.deepEqual((await repository.snapshot()).configurations.map((item) => item.id), ["claude", "codex", "grok", "antigravity"]);
  await repository.save(config); await repository.setDefault("claude");
  assert.equal((await repository.snapshot()).defaultAgent, "claude");
  assert.deepEqual((await repository.read()).configurations[0].args, config.args);
  const database = new DatabaseSync(filename);
  assert.equal(database.prepare("PRAGMA user_version").get().user_version, 14);
  assert.equal(database.prepare("SELECT value FROM settings WHERE key='theme'").get().value, '"dark"');
  database.close();
  await assert.rejects(repository.setDefault("copilot"), /AGENT_INVALID/);
});

test("环境值使用系统加密，只回传名称，留空保留且删除不依赖解密", async (context) => {
  const { repository, filename, disableEncryption } = await fixture(context);
  const secret = "PRIVATE_AGENT_TOKEN_123";
  const snapshot = await repository.save({ ...config, environment: [{ name: "API_TOKEN", value: secret }] });
  assert.deepEqual(snapshot.configurations[0].environmentNames, ["API_TOKEN"]);
  assert.ok(!JSON.stringify(snapshot).includes(secret));
  const database = new DatabaseSync(filename);
  assert.ok(!String(database.prepare("SELECT data FROM agent_configurations").get().data).includes(secret)); database.close();
  assert.equal(repository.environment((await repository.read()).configurations[0]).API_TOKEN, secret);
  await repository.save({ ...config, environment: [{ name: "API_TOKEN" }] });
  assert.equal(repository.environment((await repository.read()).configurations[0]).API_TOKEN, secret);
  disableEncryption();
  await assert.rejects(repository.save({ ...config, environment: [{ name: "API_TOKEN", value: "replace" }] }), /AGENT_SECURE_STORAGE/);
  await repository.save({ ...config, enabled: false, environment: [{ name: "API_TOKEN" }] });
  assert.equal((await repository.snapshot()).configurations[0].enabled, false);
  await repository.save({ ...config, environment: [] });
  assert.deepEqual(repository.environment((await repository.read()).configurations[0]), {});
});

test("拒绝非法参数和损坏配置，不静默重置，basic_text 不视为安全存储", async (context) => {
  const { repository, filename, safeStorage } = await fixture(context);
  for (const input of [{ ...config, args: ["bad\0argument"] }, { ...config, environment: [{ name: "BAD-NAME", value: "x" }] }, { ...config, environment: [{ name: "KEY" }, { name: "key" }] }]) {
    await assert.rejects(repository.save(input), /AGENT_INVALID/);
  }
  safeStorage.getSelectedStorageBackend = () => "basic_text";
  await assert.rejects(repository.save({ ...config, environment: [{ name: "TOKEN", value: "secret" }] }), /AGENT_SECURE_STORAGE/);
  await repository.save(config);
  const database = new DatabaseSync(filename);
  database.prepare("UPDATE agent_configurations SET data=?").run("invalid json"); database.close();
  await assert.rejects(repository.snapshot(), /AGENT_STORAGE_FAILED/);
});

test("真实可执行文件版本检测与路径回退，不通过凭证文件猜测登录", async (context) => {
  const { directory, load } = await fixture(context);
  const environment = load("src/main-process/services/agents/agentEnvironment.ts");
  const binary = path.join(directory, "fake-agent");
  await writeFile(binary, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "Agent 1.2.3"; elif [ "$1" = "auth" ]; then echo \'{"loggedIn":true,"email":"test@example.invalid","token":"PRIVATE"}\'; elif [ "$1" = "login" ]; then echo "Not logged in" >&2; exit 1; else exit 12; fi\n');
  await chmod(binary, 0o700);
  assert.equal(await environment.isAgentExecutable(directory), false);
  assert.equal(await environment.isAgentExecutable(binary), true);
  assert.equal((await environment.findAgentBinary("fake-agent", { PATH: directory })).filename, binary);
  const runtime = createLoader({ "./agentEnvironment": { ...environment, findAgentBinary: async () => ({ filename: binary, source: "path" }) } });
  const { detectAgent } = runtime("src/main-process/services/agents/agentDetection.ts");
  const settings = { ...config, customPath: binary, environment: {} };
  const claude = await detectAgent(settings, { PATH: directory });
  assert.equal(claude.version, "1.2.3"); assert.equal(claude.auth, "signedIn"); assert.equal(claude.identity, "test@example.invalid");
  assert.ok(!JSON.stringify(claude).includes("PRIVATE"));
  assert.equal((await detectAgent({ ...settings, id: "codex" }, {})).auth, "signedOut");
  assert.equal((await detectAgent({ ...settings, id: "grok" }, {})).auth, "unknown");
  assert.deepEqual((await detectAgent({ ...settings, id: "antigravity" }, {})).actions, ["manageLogin"]);
  assert.equal((await detectAgent({ ...settings, customPath: directory }, {})).status, "error");
  await writeFile(binary, '#!/bin/sh\necho "unrecognized binary"\n');
  assert.equal((await detectAgent(settings, {})).status, "error");
});

test("更新 npm 安装时固定原安装前缀，应用捆绑及自定义路径不误用安装器", async (context) => {
  const { directory, load } = await fixture(context);
  const binary = path.join(directory, "lib/node_modules/@openai/codex/bin/codex.js");
  await mkdir(path.dirname(binary), { recursive: true }); await writeFile(binary, "placeholder");
  const env = load("src/main-process/services/agents/agentEnvironment.ts");
  const runtime = createLoader({ "./agentEnvironment": { ...env, findAgentBinary: async () => ({ filename: "/test/npm", source: "path" }) } });
  const { agentUpdateCommand } = runtime("src/main-process/services/agents/agentDetection.ts");
  const stored = { ...config, id: "codex", environment: {} };
  assert.deepEqual((await agentUpdateCommand(stored, binary, {})).args, ["install", "-g", "--prefix", await realpath(directory), "@openai/codex@latest"]);
  assert.equal(await agentUpdateCommand({ ...stored, customPath: binary }, binary, {}), null);
  const bundled = path.join(directory, "Some.app/codex"); await mkdir(path.dirname(bundled)); await writeFile(bundled, "placeholder");
  assert.equal(await agentUpdateCommand(stored, bundled, {}), null);
});

test("准备命令不执行，凭据绑定窗口且一次性，完成后释放互斥，不泄露环境值", async (context) => {
  const { directory, filename, safeStorage, cleanups } = await fixture(context);
  const launches = [];
  const load = createLoader({ electron: { safeStorage },
    "./agentEnvironment": { agentShellEnvironment: async () => ({ PATH: "/test", HOME: directory }), isAgentExecutable: async () => true },
    "./agentCapabilities": { readAgentCapabilities: async () => ({}) },
    "./agentDetection": {
      detectAgent: async (value) => ({ id: value.id, status: "installed", binaryPath: "/test/" + value.id, auth: "unknown", actions: ["login", "logout", "update", "manageLogin"] }),
      detectAgentInstallation: async (value) => ({ id: value.id, status: "installed", binaryPath: "/test/" + value.id, auth: "unknown", actions: ["login", "logout", "update", "manageLogin"] }),
      detectAgentAuth: async () => ({ auth: "unknown" }),
      agentUpdateCommand: async (_config, binary) => ({ command: binary, args: ["update"] }),
    },
    "../terminal/terminalService": { createTerminal: (params, owner, launch) => launches.push({ params, owner, launch }) },
  });
  const service = new (load("src/main-process/services/agents/agentService.ts").AgentService)(filename);
  const invalidations = [];
  const invalidate = service.capabilityCache.invalidate.bind(service.capabilityCache);
  service.capabilityCache.invalidate = async (...args) => { invalidations.push(args); return invalidate(...args); };
  cleanups.push(() => service.capabilityCache.stop());
  await service.save({ ...config, environment: [{ name: "API_TOKEN", value: "PRIVATE" }] });
  await service.setDefault("claude");
  await service.save({ ...config, id: "codex", enabled: false });
  await assert.rejects(service.setDefault("codex"), /AGENT_UNAVAILABLE/);
  assert.equal((await service.repository.snapshot()).defaultAgent, "claude");
  const plan = await service.prepare("claude", "login", 1);
  assert.equal(launches.length, 0); assert.ok(!JSON.stringify(plan).includes("PRIVATE"));
  const params = { operationToken: plan.token, sessionId: "agent-" + plan.token, cols: 80, rows: 24, cwd: directory };
  assert.throws(() => service.start(params, { id: 2 }), /AGENT_EXPIRED_PLAN/);
  service.start(params, { id: 1 });
  assert.equal(launches[0].launch.env.API_TOKEN, "PRIVATE");
  assert.deepEqual(launches[0].launch.args, ["auth", "login"]);
  await assert.rejects(service.prepare("codex", "update", 1), /AGENT_BUSY/);
  assert.throws(() => service.start(params, { id: 1 }), /AGENT_EXPIRED_PLAN/);
  launches[0].launch.onFinish();
  assert.deepEqual(invalidations.at(-1), ["claude", "auth"]);
  const next = await service.prepare("codex", "update", 1);
  service.discardPlans(1);
  assert.throws(() => service.start({ ...params, operationToken: next.token, sessionId: "agent-" + next.token }, { id: 1 }), /AGENT_EXPIRED_PLAN/);
  await assert.rejects(service.prepare("zcode", "login", 1), /AGENT_INVALID/);
  const update = await service.prepare("claude", "update", 1);
  service.start({ ...params, operationToken: update.token, sessionId: "agent-" + update.token }, { id: 1 });
  launches.at(-1).launch.onFinish();
  assert.deepEqual(invalidations.at(-1), ["claude", "all"]);
});
