import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { openAppDatabase } = load("src/main-process/services/appDatabase.ts");
const { TaskRepository } = load("src/main-process/services/taskRepository.ts");
const { TaskResourceRepository } = load("src/main-process/services/taskResourceRepository.ts");
const { SessionRepository } = load("src/main-process/services/taskSessions/sessionRepository.ts");
const createdAt = "2026-01-01T00:00:00.000Z";
const task = { id: "task", title: "Task", date: createdAt, updatedAt: createdAt, projectName: "", status: "TODO" };
const agent = { agentId: "claude", modelId: "model", modelName: "Model", modeId: "default", modeName: "default", effort: null };
const session = { id: "session", taskId: task.id, kind: "agent", title: "", cwd: os.tmpdir(), agent, status: "running", terminalId: "terminal", nativeSessionId: "native", resumable: true, createdAt };

async function fixture(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-timestamps-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.parse("2026-10-08T00:00:00.000Z") });
  const filename = path.join(directory, "app.db");
  const tasks = new TaskRepository(filename, "test");
  const sessions = new SessionRepository(filename, "test");
  await tasks.importLegacy([task, { ...task, id: "other" }]);
  return { filename, tasks, sessions, resources: new TaskResourceRepository(filename, "test") };
}

function sessionRuntime(repository, initialTitle = null) {
  let title = initialTitle;
  const terminals = new Map();
  const runtime = createLoader({
    "./agentLaunch": { prepareAgentLaunch: async () => ({ command: "/mock/cli", args: [], env: {} }) },
    "./taskContext": { prepareTaskContext: async () => ({ cwd: os.tmpdir(), prompt: "test" }), taskPrompt: () => "test" },
    "../terminal/terminalService": {
      resolveShell: () => "/bin/sh",
      createTerminal: (params, owner, launch) => terminals.set(params.sessionId, launch),
      destroyTerminal: ({ sessionId }) => { terminals.get(sessionId)?.onFinish(); terminals.delete(sessionId); },
    },
  });
  const { TaskSessionService } = runtime("src/main-process/services/taskSessions/taskSessionService.ts");
  const events = [];
  const service = new TaskSessionService(repository, {}, async () => ({ ...task, agent }), () => ({ tasksDirectory: os.tmpdir() }),
    items => events.push(structuredClone(items)), undefined, async () => title,
    { environment: async () => ({ env: {} }), rename: async () => {}, remove: async () => {} });
  const owner = new EventEmitter();
  owner.id = 1; owner.isDestroyed = () => false;
  return { service, terminals, events, owner, setTitle: value => { title = value; } };
}

test("v10 升级回填任务和会话的已知时间，保留已存在的值并隔离命名空间", async context => {
  const { filename } = await fixture(context);
  await new TaskRepository(filename, "other").importLegacy([task]);
  const database = new DatabaseSync(filename);
  database.exec("ALTER TABLE tasks DROP COLUMN updated_at; PRAGMA user_version=10");
  const archivedAt = "2026-02-01T00:00:00.000Z";
  database.prepare("INSERT INTO task_sessions VALUES (?,?,?,?)").run("test", task.id, session.id, JSON.stringify({ ...session, archivedAt }));
  database.prepare("INSERT INTO task_sessions VALUES (?,?,?,?)").run("other", task.id, session.id, JSON.stringify({ ...session, lastUpdateAt: archivedAt, lastActiveAt: archivedAt }));
  database.close();
  const upgraded = await openAppDatabase(filename);
  assert.equal(upgraded.prepare("PRAGMA user_version").get().user_version, 14);
  assert.equal(upgraded.prepare("SELECT updated_at FROM tasks WHERE id=?").get(task.id).updated_at, createdAt);
  const read = namespace => JSON.parse(upgraded.prepare("SELECT data FROM task_sessions WHERE namespace=?").get(namespace).data);
  assert.equal(read("test").lastUpdateAt, archivedAt);
  assert.equal(read("test").lastActiveAt, createdAt);
  assert.equal(read("other").lastActiveAt, archivedAt);
  upgraded.close();
  const reopened = await openAppDatabase(filename);
  assert.equal(reopened.prepare("SELECT updated_at FROM tasks WHERE id=?").get(task.id).updated_at, createdAt);
  reopened.close();
});

test("任务改名、状态变更更新时间，读取、同值提交、排序和其他任务不更新", async context => {
  const { tasks } = await fixture(context);
  assert.equal((await tasks.load())[0].updatedAt, createdAt);
  await tasks.update(items => items.reverse());
  assert.ok((await tasks.load()).every(item => item.updatedAt === createdAt));
  await tasks.update(items => items.map(item => item.id === task.id ? { ...item, title: "Renamed" } : item));
  let items = await tasks.load();
  const renamedAt = items.find(item => item.id === task.id).updatedAt;
  assert.equal(renamedAt, new Date().toISOString());
  assert.equal(items.find(item => item.id === "other").updatedAt, createdAt);
  context.mock.timers.tick(2000);
  await tasks.update(items => items.map(item => ({ ...item })));
  assert.equal((await tasks.load()).find(item => item.id === task.id).updatedAt, renamedAt);
  await tasks.update(items => { items.find(item => item.id === task.id).status = "DONE"; return items; });
  items = await tasks.load();
  assert.equal(items.find(item => item.id === task.id).updatedAt, new Date().toISOString());
  assert.ok(items.every(item => item.date === createdAt));
});

test("追加资源只在实际新增或变更时更新任务，去重及幂等重试不更新", async context => {
  const { tasks, resources } = await fixture(context);
  const input = { requestId: "first", links: [], webLinks: [{ id: "link", url: "https://example.com/", title: "spec" }], notes: [] };
  await resources.append(task.id, input, []);
  const firstUpdate = (await tasks.load())[0].updatedAt;
  assert.equal(firstUpdate, new Date().toISOString());
  context.mock.timers.tick(2000);
  await resources.append(task.id, input, []);
  await resources.append(task.id, { ...input, requestId: "duplicate" }, []);
  assert.equal((await tasks.load())[0].updatedAt, firstUpdate);
  const workspace = { resourceId: "repo", name: "Repo", mode: "folder", workingPath: "/repo" };
  await resources.appendWorkspaces(task.id, "workspace", [workspace]);
  const workspaceUpdate = (await tasks.load())[0].updatedAt;
  assert.equal(workspaceUpdate, new Date().toISOString());
  context.mock.timers.tick(2000);
  await resources.appendWorkspaces(task.id, "workspace-noop", [workspace]);
  assert.equal((await tasks.load())[0].updatedAt, workspaceUpdate);
  await resources.appendWorkspaces(task.id, "workspace-change", [{ ...workspace, name: "Changed" }]);
  assert.equal((await tasks.load())[0].updatedAt, new Date().toISOString());
  assert.equal((await tasks.load())[1].updatedAt, createdAt);
});

test("会话元数据与活动时间分开保存，重复保存不刷新，兼容可选 undefined 字段", async context => {
  const { sessions, tasks } = await fixture(context);
  const current = { ...session, workspace: undefined, agent: { ...agent, effort: undefined } };
  await sessions.save(current);
  assert.equal(current.lastUpdateAt, createdAt);
  assert.equal(current.lastActiveAt, createdAt);
  await sessions.save(current);
  assert.equal(current.lastUpdateAt, createdAt);
  current.lastActiveAt = new Date().toISOString();
  await sessions.save(current);
  assert.equal(current.lastUpdateAt, createdAt);
  current.status = "stopped";
  await sessions.save(current);
  const stoppedAt = current.lastUpdateAt;
  assert.equal(stoppedAt, new Date().toISOString());
  context.mock.timers.tick(2000);
  await sessions.save(current);
  assert.equal(current.lastUpdateAt, stoppedAt);
  assert.equal((await tasks.load())[0].updatedAt, createdAt);
});

test("启动恢复不伪造活动，真实标题变更更新元数据，无变化轮询保持原时间", async context => {
  const { sessions } = await fixture(context);
  await sessions.save({ ...session });
  const runtime = sessionRuntime(sessions);
  try {
    let [current] = await runtime.service.list();
    assert.equal(current.status, "stopped");
    assert.equal(current.lastUpdateAt, createdAt);
    assert.equal(current.lastActiveAt, createdAt);
    runtime.setTitle("Real CLI name");
    context.mock.timers.tick(5000);
    [current] = await runtime.service.list();
    assert.equal(current.title, "Real CLI name");
    const titleUpdatedAt = current.lastUpdateAt;
    assert.equal(titleUpdatedAt, new Date().toISOString());
    context.mock.timers.tick(5000);
    [current] = await runtime.service.list();
    assert.equal(current.lastUpdateAt, titleUpdatedAt);
    assert.equal(current.lastActiveAt, createdAt);
  } finally { await runtime.service.shutdown(); }
});

test("PTY 活动合并落库，重启旧回调与归档后回调忽略，退出前保存最后活动", async context => {
  const { sessions, tasks } = await fixture(context);
  const runtime = sessionRuntime(sessions);
  try {
    await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
    const [current] = await runtime.service.list();
    const oldLaunch = runtime.terminals.get(current.terminalId);
    const startedAt = current.lastActiveAt;
    context.mock.timers.tick(100);
    const eventsBefore = runtime.events.length;
    for (let index = 0; index < 100; index++) oldLaunch.onActivity();
    assert.notEqual(current.lastActiveAt, startedAt);
    assert.equal((await sessions.load())[0].lastActiveAt, startedAt);
    assert.equal(runtime.events.length, eventsBefore);
    context.mock.timers.tick(900);
    await runtime.service.list();
    assert.equal((await sessions.load())[0].lastActiveAt, current.lastActiveAt);
    assert.equal(current.lastUpdateAt, startedAt);
    assert.equal(runtime.events.length, eventsBefore + 1);
    await runtime.service.restart(current.id, false, runtime.owner);
    const restartAt = current.lastActiveAt;
    context.mock.timers.tick(50);
    oldLaunch.onActivity();
    assert.equal(current.lastActiveAt, restartAt);
    const launch = runtime.terminals.get(current.terminalId);
    launch.onActivity();
    const finalActiveAt = current.lastActiveAt;
    await runtime.service.archive(current.id, runtime.owner);
    assert.equal((await sessions.load())[0].lastActiveAt, finalActiveAt);
    context.mock.timers.tick(50);
    launch.onActivity();
    assert.equal(current.lastActiveAt, finalActiveAt);
    assert.equal((await tasks.load())[0].updatedAt, createdAt);
    await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
    const next = (await runtime.service.list())[1];
    context.mock.timers.tick(50);
    runtime.terminals.get(next.terminalId).onActivity();
    await runtime.service.shutdown();
    assert.equal((await sessions.load())[1].lastActiveAt, next.lastActiveAt);
  } finally { await runtime.service.shutdown(); }
});

test("活动保存失败保留待写时间并重试，退出清理不被磁盘错误阻断", async context => {
  const { sessions } = await fixture(context);
  let failSave = false;
  const runtime = sessionRuntime({ load: () => sessions.load(), save: (...args) => failSave ? Promise.reject(new Error("EIO")) : sessions.save(...args) });
  try {
    await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
    const [current] = await runtime.service.list();
    const initialAt = current.lastActiveAt;
    context.mock.timers.tick(10);
    runtime.terminals.get(current.terminalId).onActivity();
    failSave = true;
    context.mock.timers.tick(1000);
    await runtime.service.list();
    assert.equal((await sessions.load())[0].lastActiveAt, initialAt);
    failSave = false;
    context.mock.timers.tick(1000);
    await runtime.service.list();
    assert.equal((await sessions.load())[0].lastActiveAt, current.lastActiveAt);
    context.mock.timers.tick(10);
    runtime.terminals.get(current.terminalId).onActivity();
    failSave = true;
    await assert.doesNotReject(runtime.service.shutdown());
    failSave = false;
    await runtime.service.shutdown();
    assert.equal((await sessions.load())[0].lastActiveAt, current.lastActiveAt);
  } finally { failSave = false; await runtime.service.shutdown(); }
});

test("自然退出保存最后活动及状态时间，已结束回调和重复停止不制造活动", async context => {
  const { sessions } = await fixture(context);
  const runtime = sessionRuntime(sessions);
  try {
    await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
    const [current] = await runtime.service.list();
    const launch = runtime.terminals.get(current.terminalId);
    context.mock.timers.tick(100);
    launch.onActivity();
    const activeAt = current.lastActiveAt;
    context.mock.timers.tick(100);
    launch.onFinish();
    launch.onExit(1);
    await runtime.service.list();
    assert.equal(current.status, "failed");
    assert.equal(current.lastUpdateAt, new Date().toISOString());
    assert.equal((await sessions.load())[0].lastActiveAt, activeAt);
    context.mock.timers.tick(100);
    launch.onActivity();
    assert.equal(current.lastActiveAt, activeAt);
    await runtime.service.stop(current.id, runtime.owner);
    const stoppedAt = current.lastUpdateAt;
    context.mock.timers.tick(100);
    await runtime.service.stop(current.id, runtime.owner);
    assert.equal(current.lastUpdateAt, stoppedAt);
  } finally { await runtime.service.shutdown(); }
});

test("删除任务丢弃待保存活动，延迟回调不会复活已删除会话", async context => {
  const { sessions, tasks } = await fixture(context);
  const runtime = sessionRuntime(sessions);
  try {
    await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
    const [current] = await runtime.service.list();
    const launch = runtime.terminals.get(current.terminalId);
    context.mock.timers.tick(100);
    launch.onActivity();
    await runtime.service.deleteTask(task.id, () => tasks.completeDeletion(task.id));
    launch.onActivity();
    launch.onExit(0);
    context.mock.timers.tick(1000);
    assert.deepEqual(await runtime.service.list(), []);
    assert.deepEqual(await sessions.load(), []);
  } finally { await runtime.service.shutdown(); }
});
