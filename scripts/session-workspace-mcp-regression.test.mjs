import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { lstat, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { SessionWorkspaceMcp } = load("src/main-process/services/taskSessions/sessionWorkspaceMcp.ts");
const { taskPrompt } = load("src/main-process/services/taskSessions/taskContext.ts");
const token = "ab".repeat(32);
const otherToken = "cd".repeat(32);
const homeGemini = path.join(os.homedir(), ".gemini", "config", "mcp_config.json");
const homeGrok = path.join(os.homedir(), ".grok", "config.toml");
const homeBefore = {
  gemini: existsSync(homeGemini) ? statSync(homeGemini).mtimeMs : null,
  grok: existsSync(homeGrok) ? statSync(homeGrok).mtimeMs : null,
};

function assertHomeUntouched() {
  assert.equal(existsSync(homeGemini) ? statSync(homeGemini).mtimeMs : null, homeBefore.gemini);
  assert.equal(existsSync(homeGrok) ? statSync(homeGrok).mtimeMs : null, homeBefore.grok);
}
function connection(url, activeToken = token) { return { url, token: activeToken }; }
async function directory() { return mkdtemp(path.join(os.tmpdir(), "navo-mcp-")); }
function pluginFiles(dir) {
  return {
    plugin: path.join(dir, ".agents", "plugins", "navo", "plugin.json"),
    mcp: path.join(dir, ".agents", "plugins", "navo", "mcp_config.json"),
  };
}

test("Dynamic prompt lists note size without the body", () => {
  const prompt = taskPrompt({ title: "T", description: "Body", notes: [{ id: "n", title: "Note", content: "你好", version: 2 }] }, false);
  assert.match(prompt, /"bytes":6/); assert.match(prompt, /"version":2/); assert.doesNotMatch(prompt, /你好/);
  assert.match(taskPrompt({ title: "T", description: "Body", notes: [{ id: "n", title: "Note", content: "你好", version: 2 }] }), /你好/);
});

test("Grok project config is shared by cwd, keeps user servers, and never stores the token", async (t) => {
  t.after(assertHomeUntouched);
  const root = await directory();
  const elsewhere = await directory();
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(elsewhere, { recursive: true, force: true }));
  const file = path.join(root, ".grok", "config.toml");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "# keep\n[mcp_servers.other]\nurl = \"https://example.test/mcp\"\n");
  const mcp = new SessionWorkspaceMcp();
  const url = "http://127.0.0.1:3211/mcp";
  const first = await mcp.attach({ agentId: "grok", sessionId: "one", cwd: root, connection: connection(url) });
  const second = await mcp.attach({ agentId: "grok", sessionId: "two", cwd: root, connection: connection(url, otherToken) });
  const written = await readFile(file, "utf8");
  assert.match(written, /# keep/); assert.match(written, /mcp_servers\.other/); assert.match(written, /127\.0\.0\.1:3211/);
  assert.match(written, /bearer_token_env_var = "NAVO_TASK_CONTEXT_TOKEN"/);
  assert.doesNotMatch(written, new RegExp(token)); assert.doesNotMatch(written, new RegExp(otherToken));
  assert.equal(first.env.NAVO_TASK_CONTEXT_TOKEN, token); assert.equal(second.env.NAVO_TASK_CONTEXT_TOKEN, otherToken);
  await mcp.attach({ agentId: "grok", sessionId: "three", cwd: elsewhere, connection: connection(url) });
  await mcp.release("one");
  assert.match(await readFile(file, "utf8"), /navo-task-context:begin/);
  await mcp.release("two");
  const restored = await readFile(file, "utf8");
  assert.match(restored, /mcp_servers\.other/); assert.doesNotMatch(restored, /navo_task/);
  assert.match(await readFile(path.join(elsewhere, ".grok", "config.toml"), "utf8"), /navo_task/);
  await mcp.close();
  assert.equal(existsSync(path.join(elsewhere, ".grok", "config.toml")), false);
});

test("Grok refuses a user-owned navo_task and a .grok symlink that leaves the worktree", async (t) => {
  t.after(assertHomeUntouched);
  const root = await directory();
  const outside = await directory();
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const owned = path.join(root, "owned");
  await mkdir(path.join(owned, ".grok"), { recursive: true });
  const ownedFile = path.join(owned, ".grok", "config.toml");
  const original = "[mcp_servers.navo_task]\nurl = \"https://example.test/mcp\"\n";
  await writeFile(ownedFile, original);
  const linked = path.join(root, "linked");
  await mkdir(linked, { recursive: true });
  await symlink(outside, path.join(linked, ".grok"));
  const mcp = new SessionWorkspaceMcp();
  const input = { agentId: "grok", sessionId: "one", connection: connection("http://127.0.0.1:9/mcp") };
  await assert.rejects(mcp.attach({ ...input, cwd: owned }), /SESSION_CONTEXT_UNAVAILABLE/);
  await assert.rejects(mcp.attach({ ...input, sessionId: "two", cwd: linked }), /SESSION_CONTEXT_UNAVAILABLE/);
  assert.equal(await readFile(ownedFile, "utf8"), original);
  assert.equal(existsSync(path.join(outside, "config.toml")), false);
});

test("Grok follows a config.toml symlink that stays inside .grok and refuses one that escapes", async (t) => {
  t.after(assertHomeUntouched);
  const root = await directory();
  const outside = await directory();
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const grok = path.join(root, ".grok");
  await mkdir(grok, { recursive: true });
  const target = path.join(grok, "real.toml");
  await writeFile(target, "# keep\n");
  const link = path.join(grok, "config.toml");
  await symlink(target, link);
  const mcp = new SessionWorkspaceMcp();
  const input = { agentId: "grok", sessionId: "one", connection: connection("http://127.0.0.1:9/mcp") };
  await mcp.attach({ ...input, cwd: root });
  assert.equal((await lstat(link)).isSymbolicLink(), true);
  const written = await readFile(target, "utf8");
  assert.match(written, /# keep/); assert.match(written, /navo_task/);
  const escapedRoot = path.join(root, "escaped");
  await mkdir(path.join(escapedRoot, ".grok"), { recursive: true });
  const outsideFile = path.join(outside, "config.toml");
  await writeFile(outsideFile, "secret\n");
  const escapedLink = path.join(escapedRoot, ".grok", "config.toml");
  await symlink(outsideFile, escapedLink);
  await assert.rejects(mcp.attach({ ...input, sessionId: "two", cwd: escapedRoot }), /SESSION_CONTEXT_UNAVAILABLE/);
  assert.equal(await readFile(outsideFile, "utf8"), "secret\n");
  assert.equal((await lstat(escapedLink)).isSymbolicLink(), true);
  await mcp.close();
});

test("Antigravity writes a private plugin directory and never touches the user MCP config", async (t) => {
  t.after(assertHomeUntouched);
  const root = await directory();
  const outside = await directory();
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const pluginRoot = path.join(root, "plugins");
  const userConfig = path.join(root, "mcp_config.json");
  const original = JSON.stringify({ mcpServers: { GitKraken: { type: "stdio", command: "gk", args: ["mcp"] } } });
  await writeFile(userConfig, original);
  const mcp = new SessionWorkspaceMcp({ pluginRoot });
  const url = "http://127.0.0.1:4321/mcp";
  const input = { agentId: "antigravity", cwd: root, connection: connection(url) };
  const first = await mcp.attach({ ...input, sessionId: "agy-1" });
  const second = await mcp.attach({ ...input, sessionId: "agy-2", connection: connection(url, otherToken) });
  assert.deepEqual(first.env, {}); assert.deepEqual(second.env, {});
  assert.equal(first.args[0], "--add-dir"); assert.equal(second.args[0], "--add-dir");
  assert.notEqual(first.args[1], second.args[1]);
  assert.ok(first.args[1].startsWith(await realpath(pluginRoot)));
  assert.equal(statSync(first.args[1]).mode & 0o777, 0o700);
  const files = pluginFiles(first.args[1]);
  assert.equal(statSync(files.mcp).mode & 0o777, 0o600);
  assert.equal(statSync(files.plugin).mode & 0o777, 0o600);
  const saved = JSON.parse(await readFile(files.mcp, "utf8"));
  assert.equal(saved.mcpServers.navo_task.url, url);
  assert.equal(saved.mcpServers.navo_task.headers.Authorization, `Bearer ${token}`);
  assert.doesNotMatch(JSON.stringify(saved), new RegExp(otherToken));
  assert.equal(JSON.parse(await readFile(files.plugin, "utf8")).name, "navo");
  assert.equal(await readFile(userConfig, "utf8"), original);
  await mcp.release("agy-1");
  assert.equal(existsSync(first.args[1]), false);
  assert.equal(existsSync(second.args[1]), true);
  await mcp.release("agy-2");
  assert.equal(existsSync(second.args[1]), false);
  await assert.rejects(mcp.attach({ ...input, sessionId: "../escape" }), /SESSION_CONTEXT_UNAVAILABLE/);
  await mkdir(pluginRoot, { recursive: true });
  await symlink(outside, path.join(pluginRoot, "linked"));
  await writeFile(path.join(outside, "secret"), "keep");
  await assert.rejects(mcp.attach({ ...input, sessionId: "linked" }), /SESSION_CONTEXT_UNAVAILABLE/);
  assert.equal(await readFile(path.join(outside, "secret"), "utf8"), "keep");
  assert.equal((await lstat(path.join(pluginRoot, "linked"))).isSymbolicLink(), true);
  const bare = new SessionWorkspaceMcp();
  await assert.rejects(bare.attach({ ...input, sessionId: "agy-3" }), /SESSION_CONTEXT_UNAVAILABLE/);
  const leftover = await mcp.attach({ ...input, sessionId: "agy-4" });
  assert.equal(existsSync(leftover.args[1]), true);
  const legacy = path.join(root, "task-mcp-registry");
  await mkdir(legacy);
  await writeFile(path.join(legacy, "pids.json"), token);
  const crashed = new SessionWorkspaceMcp({ pluginRoot });
  await crashed.reapAntigravity();
  assert.equal(existsSync(pluginRoot), false);
  assert.equal(existsSync(legacy), false);
  assert.equal(await readFile(path.join(outside, "secret"), "utf8"), "keep");
  await mkdir(pluginRoot);
  await symlink(outside, legacy);
  await crashed.reapAntigravity();
  assert.equal((await lstat(legacy)).isSymbolicLink(), true);
  assert.equal(await readFile(path.join(outside, "secret"), "utf8"), "keep");
  await mcp.close();
});

test("Launch uses workspace MCP only when help lists the capability and attachment succeeds", async (t) => {
  t.after(assertHomeUntouched);
  let help = "--model --permission-mode --session-id --resume --rules --mode --effort --conversation --prompt-interactive\nCommands:\n  mcp          Manage MCP\n";
  const runtime = createLoader({
    "../agents/agentEnvironment": { agentShellEnvironment: async () => ({}), runAgentProbe: async () => ({ code: 0, stdout: help, stderr: "" }) },
    "../agents/agentDetection": { detectAgent: async () => ({ binaryPath: "/fake-cli", status: "installed", auth: "signedIn" }) },
    "../../../utils/taskAgentSelection": { matchesAgentCapabilities: () => true },
  });
  const { prepareAgentLaunch } = runtime("src/main-process/services/taskSessions/agentLaunch.ts");
  const agents = { repository: { read: async () => ({ configurations: ["grok", "antigravity"].map((id) => ({ id, enabled: true, args: [] })) }), environment: () => ({}) }, capabilities: async () => ({}) };
  const selection = { agentId: "grok", modelId: "model", modelName: "Model", modeId: "default", modeName: "Default" };
  let attached = 0;
  const attach = async () => { attached += 1; return { env: { NAVO_TASK_CONTEXT_TOKEN: token } }; };
  const dynamic = await prepareAgentLaunch(agents, selection, "native-id", "full snapshot", false, undefined, undefined, "task index", async () => "file", undefined, attach);
  assert.equal(dynamic.contextMode, "dynamic"); assert.equal(attached, 1);
  assert.equal(dynamic.env.NAVO_TASK_CONTEXT_TOKEN, token); assert.ok(!dynamic.args.join(" ").includes(token)); assert.ok(!dynamic.args.includes("--rules"));
  const resumed = await prepareAgentLaunch(agents, selection, "native-id", "do not resend", true, undefined, undefined, "index", async () => "file", undefined, attach);
  assert.equal(resumed.contextMode, "dynamic"); assert.deepEqual(resumed.args.slice(-2), ["--resume", "native-id"]); assert.ok(!resumed.args.includes("--rules"));
  const failed = await prepareAgentLaunch(agents, selection, "native-id", "snapshot", false, undefined, undefined, "index", async () => "Read live file", undefined, async () => { throw new Error("disk"); });
  assert.equal(failed.contextMode, "file"); assert.ok(failed.args.includes("--rules"));
  help = "--model --permission-mode --session-id --resume --rules";
  let skipped = 0;
  const fileMode = await prepareAgentLaunch(agents, selection, "native-id", "snapshot", false, undefined, undefined, "index", async () => "Read live file", undefined, async () => { skipped += 1; return { env: {} }; });
  assert.equal(fileMode.contextMode, "file"); assert.equal(skipped, 0);
  const pluginDir = "/private/plugins/agy";
  help = "--model --mode --effort --conversation --prompt-interactive --add-dir\nAvailable subcommands:\n  mcp             Manage MCP servers\n";
  const resumedAgy = await prepareAgentLaunch(agents, { ...selection, agentId: "antigravity" }, "native-id", "do not resend", true, undefined, undefined, "index", async () => { throw new Error("file should not be prepared"); }, undefined, async () => ({ env: {}, args: ["--add-dir", pluginDir] }));
  assert.equal(resumedAgy.contextMode, "dynamic");
  assert.ok(resumedAgy.args.includes("--add-dir")); assert.ok(resumedAgy.args.includes(pluginDir));
  assert.equal(resumedAgy.env.NAVO_TASK_CONTEXT_TOKEN, undefined);
  assert.ok(resumedAgy.args.includes("--conversation"));
  assert.ok(!resumedAgy.args.some((arg) => arg.includes("do not resend") || arg.includes(token)));
  help = "--model --mode --effort --conversation --prompt-interactive\nAvailable subcommands:\n  mcp             Manage MCP servers\n";
  let skippedAddDir = 0;
  const noAddDir = await prepareAgentLaunch(agents, { ...selection, agentId: "antigravity" }, "native-id", "snapshot", false, undefined, undefined, "index", async () => "Read live file", undefined, async () => { skippedAddDir += 1; return { env: {}, args: ["--add-dir", pluginDir] }; });
  assert.equal(noAddDir.contextMode, "file"); assert.equal(skippedAddDir, 0); assert.ok(noAddDir.args.join(" ").includes("Read live file"));
});
