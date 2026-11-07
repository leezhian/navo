import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => { storage.set(key, String(value)); },
  removeItem: (key) => { storage.delete(key); },
};

const { taskSessionSummary, countTaskSessions, TASK_SESSION_GROUP_ORDER } = createLoader()("src/utils/taskSessionSummary.ts");
const { ensureReadBaseline, markSessionRead } = createLoader()("src/utils/sessionReadMarks.ts");
const session = (status, overrides = {}) => ({ id: overrides.id ?? status, taskId: "task", kind: "agent", status, ...overrides });

test("只统计当前任务未归档 Agent 会话，包括已停止与失败，不包含普通终端", () => {
  storage.clear();
  ensureReadBaseline("2026-11-07T00:00:00.000Z");
  assert.deepEqual(taskSessionSummary([
    session("stopped"), session("failed"), session("running", { archivedAt: "2026-10-08" }),
    session("starting", { taskId: "other" }), session("running", { kind: "shell" }),
  ], "task"), { count: 2, status: "failed" });
  assert.deepEqual(taskSessionSummary([], "task"), { count: 0, status: undefined });
});

test("代表状态：失败优于未读，未读优于运行中、启动中，再优于已停止", () => {
  storage.clear();
  ensureReadBaseline("2026-11-07T00:00:00.000Z");
  assert.equal(taskSessionSummary([session("running"), session("stopped")], "task").status, "running");
  assert.equal(taskSessionSummary([
    session("running", { id: "r", lastReplyAt: "2026-11-07T01:00:00.000Z" }),
    session("stopped"),
  ], "task").status, "unread");
  assert.equal(taskSessionSummary([
    session("failed"),
    session("running", { id: "r", lastReplyAt: "2026-11-07T01:00:00.000Z" }),
  ], "task").status, "failed");
  markSessionRead("r", "2026-11-07T01:00:00.000Z");
  assert.equal(taskSessionSummary([
    session("running", { id: "r", lastReplyAt: "2026-11-07T01:00:00.000Z" }),
    session("starting"),
  ], "task").status, "running");
});

test("各状态独立计数，未读不占用进程态名额，分组顺序含未读", () => {
  storage.clear();
  ensureReadBaseline("2026-11-07T00:00:00.000Z");
  const records = [
    session("running", { id: "r1" }), session("running", { id: "r2", lastReplyAt: "2026-11-07T01:00:00.000Z" }),
    session("failed"), session("starting"), session("stopped"),
    session("failed", { archivedAt: "date" }), session("running", { taskId: "other" }), session("running", { kind: "shell" }),
  ];
  assert.deepEqual(countTaskSessions(records, "task"), { running: 2, starting: 1, failed: 1, stopped: 1, unread: 1 });
  assert.deepEqual(TASK_SESSION_GROUP_ORDER, ["failed", "unread", "running", "starting", "stopped"]);
  assert.deepEqual(taskSessionSummary(records, "task"), { count: 5, status: "failed" });
});
