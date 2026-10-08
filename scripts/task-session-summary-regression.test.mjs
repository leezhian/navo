import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

const { taskSessionSummary, countTaskSessions, TASK_SESSION_GROUP_ORDER } = createLoader()("src/utils/taskSessionSummary.ts");
const session = (status, overrides = {}) => ({ taskId: "task", kind: "agent", status, ...overrides });

test("只统计当前任务未归档 Agent 会话，包括已停止与失败，不包含普通终端", () => {
  assert.deepEqual(taskSessionSummary([
    session("stopped"), session("failed"), session("running", { archivedAt: "2026-10-08" }),
    session("starting", { taskId: "other" }), session("running", { kind: "shell" }),
  ], "task"), { count: 2, status: "failed" });
  assert.deepEqual(taskSessionSummary([], "task"), { count: 0, status: undefined });
});

test("标签单一代表状态优先运行中、启动中、失败、停止，与列表顺序无关", () => {
  const priority = ["running", "starting", "failed", "stopped"];
  for (let index = 0; index < priority.length; index += 1) {
    const sessions = priority.slice(index).map(status => session(status));
    for (const records of [sessions, [...sessions].reverse()]) {
      assert.deepEqual(taskSessionSummary(records, "task"), { count: sessions.length, status: priority[index] });
    }
  }
});

test("各状态独立计数，不把总数混入单组，分组展示与标签优先级分开", () => {
  const records = [session("running"), session("running"), session("failed"), session("starting"), session("stopped"),
    session("failed", { archivedAt: "date" }), session("running", { taskId: "other" }), session("running", { kind: "shell" })];
  assert.deepEqual(countTaskSessions(records, "task"), { running: 2, starting: 1, failed: 1, stopped: 1 });
  assert.deepEqual(countTaskSessions([...records].reverse(), "task"), countTaskSessions(records, "task"));
  assert.deepEqual(TASK_SESSION_GROUP_ORDER, ["failed", "running", "starting", "stopped"]);
  assert.deepEqual(taskSessionSummary(records, "task"), { count: 5, status: "running" });
  assert.deepEqual(countTaskSessions([session("running", { archivedAt: "date" })], "task"), { running: 0, starting: 0, failed: 0, stopped: 0 });
});
