import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { createLoader } from "./helpers/load-typescript.mjs";

const { readNativeSessionBinding, nativeLaunchReference } = createLoader()("src/main-process/services/taskSessions/nativeSessionBinding.ts");
async function fixture(context, agentId) {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-native-bind-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  return { root, session: { agent: { agentId }, nativeHistoryRoot: root, nativeLaunchId: randomUUID(),
    nativeLaunchAt: new Date().toISOString(), createdAt: "2026-01-01T00:00:00Z", cwd: "/fixture/repo", resumable: false } };
}

test("Codex 只绑定目录和唯一启动标识同时匹配的原生 ID，拒绝最近会话和歧义", async context => {
  const { root, session } = await fixture(context, "codex");
  const db = new DatabaseSync(path.join(root, "state_5.sqlite"));context.after(() => db.close());
  db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY,cwd TEXT,title TEXT,first_user_message TEXT,archived INTEGER)");
  const insert = db.prepare("INSERT INTO threads VALUES (?,?,?,?,0)"), id = randomUUID();
  insert.run(randomUUID(), session.cwd, "Unrelated", "Same task text without the unique marker");
  insert.run(randomUUID(), "/other", "Other cwd", nativeLaunchReference(session.nativeLaunchId));
  assert.equal(await readNativeSessionBinding(session), null);
  insert.run(id, session.cwd, "Exact session", "Task text\n" + nativeLaunchReference(session.nativeLaunchId));
  assert.deepEqual(await readNativeSessionBinding(session), { id, title: "Exact session" });
  const duplicate = randomUUID();insert.run(duplicate, session.cwd, "Ambiguous", nativeLaunchReference(session.nativeLaunchId));
  assert.equal(await readNativeSessionBinding(session), null);
  assert.deepEqual(await readNativeSessionBinding({ ...session, nativeSessionId: id, resumable: true }), { id, title: "Exact session" });
  assert.equal(await readNativeSessionBinding({ ...session, nativeLaunchId: undefined }), null);
  db.prepare("UPDATE threads SET archived=1 WHERE id=?").run(id);
  assert.equal(await readNativeSessionBinding({ ...session, nativeSessionId: id, resumable: true }), null);
});

test("Codex JSONL 核对首轮用户消息，重启新对话按本次启动日期查找", async context => {
  const { root, session } = await fixture(context, "codex"), id = randomUUID();
  const directory = path.join(root, "sessions", session.nativeLaunchAt.slice(0,10).replaceAll("-", "/"));await mkdir(directory, { recursive: true });
  const file = path.join(directory, "rollout.jsonl");
  const meta = { type: "session_meta", payload: { id, cwd: session.cwd } };
  const user = { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: nativeLaunchReference(session.nativeLaunchId) }] } };
  await writeFile(file, [meta, { ...user, payload: { ...user.payload, role: "assistant" } }].map(JSON.stringify).join("\n"));
  assert.equal(await readNativeSessionBinding(session), null);
  await writeFile(file, [meta, { type:"response_item", payload:{type:"message",role:"user",content:[{text:"Repository instructions"}]} }, user].map(JSON.stringify).join("\n"));
  assert.deepEqual(await readNativeSessionBinding(session), { id });
});

test("Antigravity 校验 workspace URI 与用户输入中的标识，读取失败不猜测 ID", async context => {
  const { root, session } = await fixture(context, "antigravity"), id = randomUUID();
  const db = new DatabaseSync(path.join(root, "conversation_summaries.db"));context.after(() => db.close());
  db.exec("CREATE TABLE conversation_summaries (conversation_id TEXT,title TEXT,workspace_uris TEXT,last_modified_time TEXT,app_data_dir TEXT)");
  db.prepare("INSERT INTO conversation_summaries VALUES (?,?,?,?,?)").run(id, "Agy session", JSON.stringify([pathToFileURL(session.cwd).href]), new Date().toISOString(), "antigravity-cli");
  const logs = path.join(root,"brain",id,".system_generated","logs");await mkdir(logs,{recursive:true});
  assert.equal(await readNativeSessionBinding(session), null);
  await writeFile(path.join(logs,"transcript.jsonl"), JSON.stringify({type:"USER_INPUT",content:"Original prompt\n"+nativeLaunchReference(session.nativeLaunchId)})+"\n");
  assert.deepEqual(await readNativeSessionBinding(session), { id, title: "Agy session" });
  db.prepare("UPDATE conversation_summaries SET workspace_uris=?").run(JSON.stringify([pathToFileURL(session.cwd+"-other").href]));
  assert.equal(await readNativeSessionBinding(session), null);
});

test("新对话交付唯一关联标识，恢复只传原生 ID 并保留 Codex 原生历史根目录", async () => {
  const probes = [];
  const help = "--model --config --no-daemon --mode --effort --conversation --prompt-interactive";
  const runtime = createLoader({
    "../agents/agentEnvironment": { agentShellEnvironment: async () => ({}), runAgentProbe: async (_binary, args) => { probes.push(args);return { code: 0, stdout: help, stderr: "" }; } },
    "../agents/agentDetection": { detectAgent: async () => ({ binaryPath: "/fake-cli", status: "installed", auth: "signedIn" }) },
    "../../../utils/taskAgentSelection": { matchesAgentCapabilities: () => true },
  });
  const { prepareAgentLaunch } = runtime("src/main-process/services/taskSessions/agentLaunch.ts");
  const agents = { repository: { read: async () => ({ configurations: ["codex", "antigravity"].map(id => ({ id, enabled: true, args: [] })) }), environment: () => ({}) }, capabilities: async () => ({}) };
  for (const agentId of ["codex", "antigravity"]) {
    const selection = { agentId, modelId: "model", modeId: "default", effort: "high" }, launchId = randomUUID(), nativeId = randomUUID();
    const started = await prepareAgentLaunch(agents, selection, "", "Original task", false, undefined, undefined, "Dynamic task", async () => "Context file instructions", launchId);
    assert.ok(started.args.some(arg => arg.includes(nativeLaunchReference(launchId))));
    let refreshedFile = false;
    const resumed = await prepareAgentLaunch(agents, selection, nativeId, "Original task", true, "/fixture/history", undefined, "Dynamic task", async () => { refreshedFile = true;return "Context"; }, launchId);
    assert.ok(resumed.args.includes(nativeId));assert.ok(!resumed.args.some(arg => arg.includes("Original task") || arg.includes(nativeLaunchReference(launchId))));
    assert.equal(refreshedFile, false);
    if (agentId === "codex") { assert.equal(resumed.args[0], "resume");assert.equal(resumed.env.CODEX_HOME, "/fixture/history"); }
    else assert.ok(resumed.args.includes("--conversation"));
  }
  assert.ok(probes.some(args => JSON.stringify(args) === JSON.stringify(["resume", "--help"])));
});
