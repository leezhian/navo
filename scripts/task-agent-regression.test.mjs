import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createLoader } from "./helpers/load-typescript.mjs";
import { grokInitialize, grokHelp, antigravityModels, antigravityHelp } from "./fixtures/agentCapabilities.mjs";

const load = createLoader();
const { parseClaudeCapabilities, parseCodexCapabilities } = load("src/main-process/services/agents/agentCapabilities.ts");
const { defaultAgentSelection, matchesAgentCapabilities, isTaskAgentSelection } = load("src/utils/taskAgentSelection.ts");
const claudeResponse = { current_permission_mode: "plan", models: [
  { value: "default", resolvedModel: "provider/custom-model", displayName: "Default", supportsEffort: true, supportedEffortLevels: ["low", "high"], supportsAutoMode: true },
  { value: "fast", displayName: "Fast model", supportsEffort: false, supportedEffortLevels: ["max"] },
] };
const help = '--permission-mode <mode> Permission mode (choices: "manual", "plan", "auto")';

test("Grok 与 Antigravity 通过真实命令协议形态读取能力，不再落入未接入分支", async () => {
  const calls = []; let closed = 0;
  const runtime = createLoader({
    "./agentEnvironment": { runAgentProbe: async (binary, args) => {
      calls.push({ binary, args });
      return { code: 0, stdout: binary === "/fixture/grok" ? grokHelp : args[0] === "models" ? antigravityModels : "", stderr: binary === "/fixture/agy" && args[0] === "--help" ? antigravityHelp : "" };
    } },
    "./agentProtocolClient": { openAgentProtocol: (binary, args) => {
      calls.push({ binary, args });
      return { request: async (_id, message) => { calls.push(message); return grokInitialize; }, close: () => { closed += 1; } };
    } },
  });
  const { readAgentCapabilities } = runtime("src/main-process/services/agents/agentCapabilities.ts");
  const grok = await readAgentCapabilities("grok", "/fixture/grok", {});
  assert.deepEqual(grok.models.map((model) => model.name), ["Grok Runtime", "Grok Legacy", "Grok Simple"]);
  assert.equal(grok.defaultModelId, "grok-runtime");
  assert.deepEqual(grok.models[0].efforts, ["low", "high", "xhigh"]);
  assert.deepEqual(grok.models[1].efforts, ["low", "high"]);
  assert.deepEqual(grok.models[2].efforts, []);
  assert.equal(grok.models[0].defaultEffort, "high");
  assert.equal(grok.models[1].defaultEffort, "high");
  assert.equal(closed, 1);
  assert.ok(calls.some((call) => JSON.stringify(call.args) === JSON.stringify(["agent", "--no-leader", "stdio"])));
  assert.deepEqual(calls.filter((call) => call.method).map((call) => call.method), ["initialize"]);
  calls.length = 0;
  const antigravity = await readAgentCapabilities("antigravity", "/fixture/agy", {});
  assert.deepEqual(antigravity.models.map((model) => model.name), ["Gemini Runtime (High)", "Claude Runtime (Thinking)"]);
  assert.deepEqual(antigravity.modes.map((mode) => mode.id), ["accept-edits", "plan"]);
  assert.deepEqual(antigravity.models[0].efforts, ["low", "medium", "high", "xhigh", "max"]);
  assert.equal(antigravity.models[0].defaultEffort, null);
  assert.deepEqual(calls.map((call) => call.args[0]).sort(), ["--help", "models"]);
});

test("原生能力输出损坏或查询失败时不填入静态模型和模式", async () => {
  const { parseGrokCapabilities } = load("src/main-process/services/agents/grokCapabilities.ts");
  const { parseAntigravityCapabilities } = load("src/main-process/services/agents/antigravityCapabilities.ts");
  assert.throws(() => parseGrokCapabilities({}, grokHelp), /AGENT_CAPABILITIES_FAILED/);
  assert.throws(() => parseGrokCapabilities(grokInitialize, "--other-mode [possible values: arbitrary]"), /AGENT_CAPABILITIES_FAILED/);
  assert.throws(() => parseAntigravityCapabilities("Fetching models...\n", antigravityHelp), /AGENT_CAPABILITIES_FAILED/);
  assert.throws(() => parseAntigravityCapabilities(antigravityModels, "--other-mode (invented)"), /AGENT_CAPABILITIES_FAILED/);
  const noEffort = parseAntigravityCapabilities(antigravityModels, "--mode Available modes (plan)\n");
  assert.deepEqual(noEffort.models[0].efforts, []);
  const runtime = createLoader({ "./agentEnvironment": { runAgentProbe: async () => ({ code: 1, stdout: antigravityModels, stderr: "PRIVATE" }) } });
  const { readAgentCapabilities } = runtime("src/main-process/services/agents/agentCapabilities.ts");
  await assert.rejects(readAgentCapabilities("antigravity", "/fixture/agy", {}), (error) => error.message === "AGENT_CAPABILITIES_FAILED");
  await assert.rejects(readAgentCapabilities("grok", "/fixture/grok", {}), (error) => error.message === "AGENT_CAPABILITIES_FAILED");
});

test("旧预加载接口或主进程未注册能力查询时明确要求重启，不伪装成空模型", async () => {
  const previousWindow = globalThis.window;
  const runtime = createLoader();
  const { readTaskAgentCapabilities } = runtime("src/services/agentApi.ts");
  try {
    globalThis.window = { navo: { agents: {} } };
    await assert.rejects(readTaskAgentCapabilities("claude"), /AGENT_RUNTIME_OUTDATED/);
    globalThis.window.navo.agents.capabilities = async () => { throw new Error("Error invoking remote method 'agents:capabilities': Error: No handler registered for 'agents:capabilities'"); };
    await assert.rejects(readTaskAgentCapabilities("claude"), /AGENT_RUNTIME_OUTDATED/);
    globalThis.window.navo.agents.capabilities = async () => { throw new Error("AGENT_CAPABILITIES_FAILED"); };
    await assert.rejects(readTaskAgentCapabilities("claude"), /AGENT_CAPABILITIES_FAILED/);
    globalThis.window.navo.agents.capabilities = async () => ({ models: [{ id: "real" }] });
    assert.equal((await readTaskAgentCapabilities("claude")).models[0].id, "real");
  } finally { globalThis.window = previousWindow; }
});

test("Claude 使用真实模型别名映射、模型级思考等级和 CLI 模式，不补充虚构选项", () => {
  const result = parseClaudeCapabilities(claudeResponse, help);
  assert.deepEqual(result.models.map((model) => model.id), ["default", "fast"]);
  assert.equal(result.models[0].name, "provider/custom-model");
  assert.deepEqual(result.models[0].efforts, ["low", "high"]);
  assert.deepEqual(result.models[1].efforts, []);
  const selected = defaultAgentSelection(result);
  assert.equal(selected.modeId, "plan");
  assert.equal(selected.effort, null);
  assert.equal(matchesAgentCapabilities({ ...selected, effort: "max" }, result), false);
  assert.equal(matchesAgentCapabilities({ ...selected, modelId: "fast", modeId: "auto" }, result), false);
  assert.equal(matchesAgentCapabilities({ ...selected, modelId: "fast", effort: "high" }, result), false);
  assert.throws(() => parseClaudeCapabilities({}, help), /AGENT_CAPABILITIES_FAILED/);
  assert.throws(() => parseClaudeCapabilities(claudeResponse, "unrecognized help"), /AGENT_CAPABILITIES_FAILED/);
});

test("Codex 隐藏模型过滤与默认模型、思考等级、协作模式来自协议返回", () => {
  const result = parseCodexCapabilities([
    { id: "internal", model: "real-model", displayName: "Runtime model", supportedReasoningEfforts: [{ reasoningEffort: "medium" }, { reasoningEffort: "ultra" }], defaultReasoningEffort: "medium", isDefault: true },
    { id: "hidden", hidden: true },
  ], [{ mode: "plan", name: "Plan" }, { mode: "default", name: "Default" }]);
  const selected = defaultAgentSelection(result);
  assert.deepEqual(result.models.map((model) => model.id), ["real-model"]);
  assert.equal(selected.effort, "medium");
  assert.equal(selected.modeId, "default");
  assert.equal(isTaskAgentSelection(selected), true);
  for (const invalid of [null, { ...selected, agentId: "unknown" }, { ...selected, modelId: "" }, { ...selected, effort: "bad\0effort" }]) assert.equal(isTaskAgentSelection(invalid), false);
});

test("能力查询只发送初始化和元数据请求，Codex 支持分页且查询后关闭进程", async () => {
  const calls = []; let closed = 0; let args;
  const client = {
    send: (message) => calls.push(message), close: () => { closed += 1; },
    request: async (_id, message) => {
      calls.push(message);
      if (message.type === "control_request") return claudeResponse;
      if (message.method === "model/list") return message.params.cursor ? { data: [{ model: "runtime-model", displayName: "Runtime model", isDefault: true }], nextCursor: null } : { data: [], nextCursor: "second-page" };
      if (message.method === "collaborationMode/list") return { data: [{ mode: "default", name: "Default" }] };
      return {};
    },
  };
  const runtime = createLoader({ "./agentEnvironment": { runAgentProbe: async () => ({ code: 0, stdout: help }) },
    "./agentProtocolClient": { openAgentProtocol: (_binary, commandArgs) => { args = commandArgs; return client; } } });
  const { readAgentCapabilities } = runtime("src/main-process/services/agents/agentCapabilities.ts");
  await readAgentCapabilities("claude", "/fixture/cli", {});
  assert.ok(args.includes("--no-session-persistence"));
  assert.ok(args.includes('{"disableAllHooks":true}'));
  assert.ok(args.includes("--strict-mcp-config"));
  assert.equal(closed, 1); calls.length = 0;
  assert.equal((await readAgentCapabilities("codex", "/fixture/cli", {})).models[0].id, "runtime-model");
  assert.deepEqual(calls.map((call) => call.method), ["initialize", "initialized", "model/list", "model/list", "collaborationMode/list"]);
  assert.equal(closed, 2);
  client.request = async () => { throw new Error("protocol rejected"); };
  await assert.rejects(readAgentCapabilities("claude", "/fixture/cli", {}));
  assert.equal(closed, 3);
});

test("协议进程处理响应、异常退出和超量输出，不泄露原始日志", async () => {
  const { openAgentProtocol } = load("src/main-process/services/agents/agentProtocolClient.ts");
  const client = openAgentProtocol(process.execPath, ["-e", "process.stdin.on('data',chunk=>{const message=JSON.parse(chunk);process.stdout.write(JSON.stringify({id:message.id,result:{models:[]}})+'\\n')})"], {});
  try { assert.deepEqual(await client.request(1, { id: 1, method: "model/list" }), { models: [] }); }
  finally { client.close(); }
  for (const script of ["process.stderr.write('PRIVATE');process.exit(1)", "process.stdout.write('PRIVATE'.repeat(400000))"]) {
    const failed = openAgentProtocol(process.execPath, ["-e", script], {});
    try { await assert.rejects(failed.request(1, { id: 1 }), (error) => error.message === "AGENT_CAPABILITIES_FAILED"); }
    finally { failed.close(); }
  }
});

test("选择规则只排除明确未安装、未登录和禁用，未知及探测失败仍可尝试", () => {
  const { canSelectTaskAgent } = load("src/domain/agents.ts");
  for (const status of ["installed", "missing", "error"]) for (const auth of ["signedIn", "signedOut", "unknown"]) {
    assert.equal(canSelectTaskAgent({ enabled: true }, { status, auth }), status !== "missing" && auth !== "signedOut");
    assert.equal(canSelectTaskAgent({ enabled: false }, { status, auth }), false);
  }
  assert.equal(canSelectTaskAgent({ enabled: true }), true);
});

test("后端允许未知状态查询能力，拒绝明确不可用的 Agent，并区分探测失败", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-agent-access-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  let auth = "unknown"; let status = "installed"; let binaryPath = "/fixture/cli"; let probes = 0;
  const runtime = createLoader({ electron: { safeStorage: { isEncryptionAvailable: () => true } },
    "./agentEnvironment": { agentShellEnvironment: async () => ({}), isAgentExecutable: async () => true },
    "./agentDetection": { detectAgent: async (config) => ({ id: config.id, status, auth, binaryPath }) },
    "./agentCapabilities": { readAgentCapabilities: async () => { probes += 1; return {}; } },
    "../terminal/terminalService": {},
  });
  const service = new (runtime("src/main-process/services/agents/agentService.ts").AgentService)(path.join(directory, "app.db"));
  context.after(() => service.capabilityCache.stop());
  await assert.rejects(service.capabilities("claude"), /AGENT_CAPABILITIES_PENDING/);
  assert.equal(probes, 0);
  await service.capabilityCache.refresh("claude");
  await service.capabilities("claude"); assert.equal(probes, 1);
  auth = "signedOut"; await service.capabilityCache.refresh("claude"); await assert.rejects(service.capabilities("claude"), /AGENT_UNAVAILABLE/);
  assert.equal(probes, 1);
  auth = "unknown"; status = "missing"; await service.capabilityCache.refresh("claude"); await assert.rejects(service.capabilities("claude"), /AGENT_UNAVAILABLE/);
  status = "error"; await service.capabilityCache.invalidate("claude"); await service.capabilityCache.refresh("claude"); await service.capabilities("claude"); assert.equal(probes, 2);
  binaryPath = null; await service.capabilityCache.refresh("claude"); await assert.rejects(service.capabilities("claude"), /AGENT_CAPABILITIES_FAILED/);
  binaryPath = "/fixture/cli"; status = "installed";
  auth = "signedIn"; await service.capabilityCache.refresh("claude"); await service.capabilities("claude"); assert.equal(probes, 3);
  await service.save({ id: "claude", enabled: false, customPath: "", args: [], environment: [] });
  await assert.rejects(service.capabilities("claude"), /AGENT_UNAVAILABLE/); assert.equal(probes, 3);
});
