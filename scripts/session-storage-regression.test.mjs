import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";

const createdAt = "2026-01-01T00:00:00.000Z";
const agent = { agentId: "claude", modelId: "model", modelName: "Model", modeId: "default", modeName: "default", effort: null };
const task = { id: "task", title: "Task", date: createdAt, updatedAt: createdAt, projectName: "", status: "TODO", resources: [] };
const session = { id: "valid", taskId: task.id, kind: "agent", title: "", cwd: os.tmpdir(), agent,
  status: "stopped", terminalId: "terminal-valid", resumable: false, createdAt };

async function fixture(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-session-storage-"));
  const filename = path.join(directory, "app.db");
  const processes = new Map();
  const load = createLoader({
    "../terminal/terminalService": {
      resolveShell: () => "/mock/shell",
      createTerminal: (params, _owner, launch) => processes.set(params.sessionId, launch),
      destroyTerminal: ({ sessionId }) => processes.delete(sessionId),
    },
    "./taskContext": { prepareTaskContext: async () => ({ cwd: directory, prompt: "test" }), taskPrompt: () => "test" },
  });
  const logger = load("src/main-process/diagnostics/diagnosticLogger.ts");
  const logPath = path.join(directory, "diagnostics.log");
  logger.diagnosticWriter.configure(() => logPath);
  context.after(async () => { await logger.diagnosticWriter.flush(); await rm(directory, { recursive: true, force: true }); });
  const { TaskRepository } = load("src/main-process/services/taskRepository.ts");
  const { SessionRepository } = load("src/main-process/services/taskSessions/sessionRepository.ts");
  await new TaskRepository(filename, "test").importLegacy([task, { ...task, id: "other-task" }]);
  const insert = (id, data, taskId = task.id) => {
    const database = new DatabaseSync(filename);
    try { database.prepare("INSERT INTO task_sessions VALUES (?,?,?,?)").run("test", taskId, id, data); }
    finally { database.close(); }
  };
  insert(session.id, JSON.stringify(session));
  return { load, filename, logger, logPath, processes, insert, repository: new SessionRepository(filename, "test") };
}

test("逐条隔离损坏 JSON、非法字段和冒用身份，保留原始记录且日志不含正文", async (context) => {
  const { repository, insert, filename, logger, logPath } = await fixture(context);
  const invalid = [
    { status: "impossible" }, { kind: "shell" }, { title: null }, { agent: { agentId: "unknown" } },
    { workspace: { kind: "resource", resourceId: null } }, { resumable: "yes" },
    { createdAt: "invalid" }, { lastActiveAt: "invalid" }, { archivedAt: 123 },
    { terminalId: "" }, { nativeHistoryRoot: {} }, { error: [] },
  ];
  invalid.forEach((fields, index) => insert(`bad-${index}`, JSON.stringify({ ...session, id: `bad-${index}`, ...fields })));
  insert("broken", "{PRIVATE_SESSION_CONTENT");
  insert("null", "null");
  insert("duplicate", JSON.stringify(session));
  insert("foreign-task", JSON.stringify({ ...session, id: "foreign-task" }), "other-task");
  const records = await repository.load();
  assert.deepEqual(records, [{ ...session, lastUpdateAt: createdAt, lastActiveAt: createdAt }]);
  const database = new DatabaseSync(filename);
  try {
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM task_sessions").get().count, invalid.length + 5);
    assert.equal(database.prepare("SELECT data FROM task_sessions WHERE id='broken'").get().data, "{PRIVATE_SESSION_CONTENT");
  } finally { database.close(); }
  await logger.diagnosticWriter.flush();
  const log = await readFile(logPath, "utf8");
  const warning = log.trim().split("\n").map(JSON.parse).find((entry) => entry.event === "session.records_invalid");
  assert.equal(warning.level, "WARN");
  assert.equal(warning.data.count, invalid.length + 4);
  assert.doesNotMatch(log, /PRIVATE_SESSION_CONTENT|impossible|terminal-valid/);
});

test("坏会话不阻断正常会话读取和新终端创建", async (context) => {
  const { load, repository, insert, processes } = await fixture(context);
  insert("broken", "{broken");
  const { TaskSessionService } = load("src/main-process/services/taskSessions/taskSessionService.ts");
  const service = new TaskSessionService(repository, {}, async () => task, () => ({ tasksDirectory: os.tmpdir() }), () => {}, undefined, async () => null);
  const owner = new EventEmitter(); owner.id = 1; owner.isDestroyed = () => false;
  try {
    assert.deepEqual((await service.list()).map((item) => item.id), [session.id]);
    const records = await service.start({ taskId: task.id, kind: "shell" }, owner);
    assert.equal(records.length, 2);
    assert.equal(records[1].status, "running");
    assert.equal(processes.size, 1);
  } finally { await service.shutdown(); }
});

test("旧库升级跳过坏会话，正常会话回填已知时间且不删除坏记录", async (context) => {
  const { load, filename, repository, insert } = await fixture(context);
  insert("broken", "{broken");
  insert("bad-state", JSON.stringify({ ...session, id: "bad-state", status: "impossible" }));
  const database = new DatabaseSync(filename);
  database.exec("PRAGMA user_version=10");
  database.close();
  const { openAppDatabase } = load("src/main-process/services/appDatabase.ts");
  const upgraded = await openAppDatabase(filename);
  try {
    assert.equal(upgraded.prepare("PRAGMA user_version").get().user_version, 15);
    const saved = JSON.parse(upgraded.prepare("SELECT data FROM task_sessions WHERE id=?").get(session.id).data);
    assert.equal(saved.lastActiveAt, createdAt);
    assert.equal(saved.lastUpdateAt, createdAt);
    assert.equal(upgraded.prepare("SELECT data FROM task_sessions WHERE id='broken'").get().data, "{broken");
  } finally { upgraded.close(); }
  assert.equal((await repository.load()).length, 1);
});
