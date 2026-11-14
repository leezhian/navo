import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";

const { readNativeSessionActivity } = createLoader()("src/main-process/services/taskSessions/nativeSessionActivity.ts");
const { NATIVE_ACTIVITY_CAPABILITIES } = createLoader()("src/shared/taskSessionActivity.ts");
const id = "3211c729-32c4-47d1-bde3-a89b73ea021d";
const base = { kind: "agent", cwd: "/test/project", nativeSessionId: id, status: "running" };

test("能力矩阵：Grok 全套，Claude/Codex 仅回合，Antigravity 无信号", () => {
  assert.deepEqual(NATIVE_ACTIVITY_CAPABILITIES.grok.phases, ["answering", "reasoning", "executingTool", "waitingModel", "waitingPermission", "idle"]);
  assert.equal(NATIVE_ACTIVITY_CAPABILITIES.grok.waitingReason, true);
  assert.equal(NATIVE_ACTIVITY_CAPABILITIES.grok.reply, true);
  assert.deepEqual(NATIVE_ACTIVITY_CAPABILITIES.claude.phases, ["answering", "idle"]);
  assert.equal(NATIVE_ACTIVITY_CAPABILITIES.claude.waitingReason, false);
  assert.deepEqual(NATIVE_ACTIVITY_CAPABILITIES.codex.phases, ["answering", "idle"]);
  assert.deepEqual(NATIVE_ACTIVITY_CAPABILITIES.antigravity.phases, []);
  assert.equal(NATIVE_ACTIVITY_CAPABILITIES.antigravity.reply, false);
});

test("Grok events：回合、权限等待与回复时间", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-activity-grok-"));
  try {
    const directory = path.join(root, "sessions", encodeURIComponent(base.cwd), id);
    await mkdir(directory, { recursive: true });
    const filename = path.join(directory, "events.jsonl");
    const session = { ...base, agent: { agentId: "grok" } };
    await writeFile(filename, [
      { type: "turn_started", ts: "2026-11-07T01:00:00.000Z" },
      { type: "permission_requested", tool_name: "Bash", ts: "2026-11-07T01:00:01.000Z" },
    ].map((row) => JSON.stringify(row)).join("\n"));
    assert.deepEqual(await readNativeSessionActivity(session, { GROK_HOME: root }), {
      phase: "waitingPermission", waitingReason: "Bash",
    });
    await writeFile(filename, [
      { type: "turn_started", ts: "2026-11-07T01:00:00.000Z" },
      { type: "permission_requested", tool_name: "Bash", ts: "2026-11-07T01:00:01.000Z" },
      { type: "permission_resolved", tool_name: "Bash", decision: "approved", ts: "2026-11-07T01:00:02.000Z" },
      { type: "turn_ended", outcome: "completed", ts: "2026-11-07T01:00:03.000Z" },
    ].map((row) => JSON.stringify(row)).join("\n"));
    assert.deepEqual(await readNativeSessionActivity(session, { GROK_HOME: root }), {
      phase: "idle", waitingReason: undefined, lastReplyAt: "2026-11-07T01:00:03.000Z",
    });
    await writeFile(filename, JSON.stringify({ type: "turn_ended", outcome: "cancelled", ts: "2026-11-07T01:00:04.000Z" }));
    assert.deepEqual(await readNativeSessionActivity(session, { GROK_HOME: root }), { phase: "idle", waitingReason: undefined });
    await writeFile(filename, [
      { type: "turn_started", ts: "2026-11-07T01:01:00.000Z" },
      { type: "phase_changed", phase: "streaming_reasoning", ts: "2026-11-07T01:01:01.000Z" },
      { type: "phase_changed", phase: "tool_execution", ts: "2026-11-07T01:01:02.000Z" },
      { type: "phase_changed", phase: "permission_prompt", ts: "2026-11-07T01:01:03.000Z" },
      { type: "permission_requested", tool_name: "Bash", ts: "2026-11-07T01:01:04.000Z" },
      { type: "phase_changed", phase: "not_a_real_phase", ts: "2026-11-07T01:01:05.000Z" },
    ].map((row) => JSON.stringify(row)).join("\n"));
    assert.deepEqual(await readNativeSessionActivity(session, { GROK_HOME: root }), {
      phase: "waitingPermission", waitingReason: "Bash",
    });
    await writeFile(filename, JSON.stringify({ type: "phase_changed", phase: "waiting_for_model", ts: "2026-11-07T01:02:00.000Z" }));
    assert.deepEqual(await readNativeSessionActivity(session, { GROK_HOME: root }), { phase: "waitingModel", waitingReason: undefined });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Claude jsonl：真实用户输入与 turn_duration；工具结果不算新回合", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-activity-claude-"));
  try {
    const directory = path.join(root, "projects", base.cwd.replace(/[^a-zA-Z0-9]/g, "-"));
    await mkdir(directory, { recursive: true });
    const filename = path.join(directory, id + ".jsonl");
    const session = { ...base, agent: { agentId: "claude" } };
    await writeFile(filename, [
      { type: "user", sessionId: id, message: { content: [{ type: "tool_result", content: "ok" }] } },
      { type: "user", sessionId: id, isMeta: true, message: { content: "meta" } },
      { type: "user", sessionId: id, message: { content: "hello" } },
    ].map((row) => JSON.stringify(row)).join("\n"));
    assert.deepEqual(await readNativeSessionActivity(session, { CLAUDE_CONFIG_DIR: root }), { phase: "answering" });
    await writeFile(filename, [
      { type: "user", sessionId: id, message: { content: "hello" } },
      { type: "system", subtype: "turn_duration", sessionId: id, timestamp: "2026-11-07T02:00:00.000Z" },
    ].map((row) => JSON.stringify(row)).join("\n"));
    assert.deepEqual(await readNativeSessionActivity(session, { CLAUDE_CONFIG_DIR: root }), {
      phase: "idle", lastReplyAt: "2026-11-07T02:00:00.000Z",
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Codex rollout：经 state sqlite 定位；task_complete 才算回复", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-activity-codex-"));
  try {
    const rollout = path.join(root, "session-rollout.jsonl");
    await writeFile(rollout, [
      { type: "event_msg", timestamp: "2026-11-07T03:00:00.000Z", payload: { type: "task_started" } },
      { type: "event_msg", timestamp: "2026-11-07T03:00:01.000Z", payload: { type: "task_complete" } },
    ].map((row) => JSON.stringify(row)).join("\n"));
    const db = new DatabaseSync(path.join(root, "state_5.sqlite"));
    db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT)");
    db.prepare("INSERT INTO threads (id, rollout_path) VALUES (?, ?)").run(id, rollout);
    db.close();
    const session = { ...base, agent: { agentId: "codex" } };
    assert.deepEqual(await readNativeSessionActivity(session, { CODEX_HOME: root }), {
      phase: "idle", lastReplyAt: "2026-11-07T03:00:01.000Z",
    });
    await writeFile(rollout, JSON.stringify({ type: "event_msg", timestamp: "2026-11-07T03:00:02.000Z", payload: { type: "turn_aborted" } }));
    assert.deepEqual(await readNativeSessionActivity(session, { CODEX_HOME: root }), { phase: "idle" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("无能力、无绑定或越界路径时返回 null", async () => {
  assert.equal(await readNativeSessionActivity({ ...base, agent: { agentId: "antigravity" } }), null);
  assert.equal(await readNativeSessionActivity({ ...base, agent: { agentId: "grok" }, nativeSessionId: undefined }), null);
  assert.equal(await readNativeSessionActivity({ ...base, agent: { agentId: "grok" }, nativeSessionId: "../escape" }), null);
});
