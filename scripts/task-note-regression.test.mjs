import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { TaskRepository } = load("src/main-process/services/taskRepository.ts");
const { TaskResourceBindings } = load("src/main-process/services/taskResourceBindings.ts");
const { TaskNoteRepository } = load("src/main-process/services/taskNoteRepository.ts");
const { openAppDatabase } = load("src/main-process/services/appDatabase.ts");
const { TaskContextServer } = load("src/main-process/services/taskSessions/taskContextServer.ts");
const { TaskContextFiles } = load("src/main-process/services/taskSessions/taskContextFiles.ts");
const base = { id: "task", title: "Task", description: "Prompt", date: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z", projectName: "", status: "TODO" };
const addition = notes => ({ requestId: randomUUID(), notes, links: [], webLinks: [], fileIds: [] });

async function fixture(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-notes-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "app.db"), tasks = new TaskRepository(filename, "test");
  await tasks.create(base, []); await tasks.create({ ...base, id: "other" }, []);
  return { directory, filename, tasks, bindings: new TaskResourceBindings(tasks, filename, "test"),
    notes: new TaskNoteRepository(filename, "test"), task: async (id = base.id) => (await tasks.load()).find(task => task.id === id) };
}

test("v12 笔记迁移保留正文与顺序，时间取任务原值，升级及重启不制造活动", async context => {
  const { filename, tasks, task } = await fixture(context);
  let db = await openAppDatabase(filename);
  db.exec(`DROP TABLE task_notes;
    CREATE TABLE task_notes (namespace TEXT NOT NULL,task_id TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,
      PRIMARY KEY(namespace,task_id,id),FOREIGN KEY(namespace,task_id) REFERENCES tasks(namespace,id) ON DELETE CASCADE);
    PRAGMA user_version=12;`);
  const ids = [randomUUID(), randomUUID()];
  for (const [index, id] of ids.entries()) db.prepare("INSERT INTO task_notes VALUES (?,?,?,?,?)").run("test", base.id, id, "旧笔记" + index, "# 正文 " + index);
  db.prepare("INSERT INTO task_notes VALUES (?,?,?,?,?)").run("test", "other", randomUUID(), "另一个任务", "保留");db.close();
  const migrated = await task();
  assert.equal(migrated.updatedAt, base.updatedAt);assert.equal(migrated.contextVersion, 1);
  assert.deepEqual(migrated.notes.map(note => [note.id, note.version, note.origin, note.sortOrder, note.createdAt, note.updatedAt]),
    ids.map((id, index) => [id, 1, "user", index, base.date, base.updatedAt]));
  assert.equal(migrated.notes[1].content, "# 正文 1");assert.equal((await task("other")).notes[0].sortOrder, 0);
  db = await openAppDatabase(filename);assert.equal(db.prepare("PRAGMA user_version").get().user_version, 14);db.close();
  assert.deepEqual((await new TaskRepository(filename, "test").load()).find(task => task.id === base.id), migrated);
  await tasks.completeDeletion(base.id);assert.equal(await task(), undefined);
});

test("笔记独立版本阻止并发及 ABA 覆盖，排序持久化，来源不被后续编辑伪造", async context => {
  const { filename, task, bindings } = await fixture(context);
  const first = { id: randomUUID(), title: "First", content: "A", version: 99, origin: "agent", sessionId: "spoof" };
  const second = { id: randomUUID(), title: "Second", content: "B" };
  await bindings.add(base.id, addition([first, second]), 1);
  let current = await task();const initial = current.notes[0];
  assert.equal(initial.origin, "user");assert.equal(initial.sessionId, undefined);assert.equal(initial.version, 1);
  const outcomes = await Promise.allSettled([
    bindings.updateNote(base.id, { ...first, content: "winner 1" }, 1),
    bindings.updateNote(base.id, { ...first, content: "winner 2" }, 1),
  ]);
  assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
  const conflict = outcomes.find(result => result.status === "rejected").reason;
  assert.equal(conflict.message, "TASK_CONTENT_CHANGED");assert.equal(conflict.currentVersion, 2);
  await bindings.updateNote(base.id, { ...first, sortOrder: 3 }, 2);
  current = await task();const restored = current.notes[1];
  assert.equal(restored.content, "A");assert.equal(restored.version, 3);assert.equal(restored.createdAt, initial.createdAt);
  assert.equal(restored.origin, "user");assert.equal(current.notes[0].id, second.id);assert.equal(current.notes[0].version, 1);
  await assert.rejects(bindings.updateNote(base.id, { ...first, content: "stale A" }, 1), /CONTENT_CHANGED/);
  await assert.rejects(bindings.deleteNote(base.id, first.id, 1), /CONTENT_CHANGED/);
  const unchanged = await bindings.updateNote(base.id, { ...first, sortOrder: 3 }, 3);
  assert.deepEqual(unchanged, current);
  for (const version of [undefined, null, 0, -1, 1.5, "3", Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(bindings.updateNote(base.id, first, version), /INVALID/);
    await assert.rejects(bindings.deleteNote(base.id, first.id, version), /INVALID/);
  }
  assert.deepEqual((await new TaskRepository(filename, "test").load()).find(task => task.id === base.id).notes, current.notes);
  await bindings.deleteNote(base.id, first.id, 3);assert.deepEqual((await task()).notes, [current.notes[0]]);
});

test("MCP 真实 SQLite 笔记 CRUD、元数据、冲突提示、跨任务隔离和凭证撤销", async context => {
  const { directory, task, bindings, tasks } = await fixture(context);
  const published = [], files = new TaskContextFiles();
  context.after(() => files.close());
  const contextPath = JSON.parse((await files.prepare("file-session", await task(), directory, [])).split("\n")[1]);
  const publish = async updated => { published.push(updated);await files.update("file-session", updated, []);return updated; };
  let gate, entered;
  const server = new TaskContextServer(task, undefined, {
    create: async (id, note, sessionId, authorize) => { if (gate) { entered();await gate; } return publish(await bindings.createAgentNote(id, note, sessionId, authorize)); },
    update: async (id, note, version, authorize) => publish(await bindings.updateNote(id, note, version, authorize)),
    remove: async (id, noteId, version, authorize) => publish(await bindings.deleteNote(id, noteId, version, authorize)),
  });
  context.after(() => server.close());
  const one = await server.connect("agent-one", base.id), peer = await server.connect("agent-peer", base.id), other = await server.connect("agent-other", "other");
  const rpc = async (connection, method, params = {}) => fetch(connection.url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${connection.token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const call = async (connection, name, args = {}) => (await (await rpc(connection, "tools/call", { name, arguments: args })).json()).result;
  const data = result => JSON.parse(result.content[0].text);
  const tools = (await (await rpc(one, "tools/list")).json()).result.tools;
  assert.deepEqual(tools.map(tool => tool.name), ["get_task_context", "get_task_note", "create_task_note", "update_task_note", "delete_task_note"]);
  assert.equal(tools[2].annotations.readOnlyHint, false);assert.equal(tools[4].annotations.destructiveHint, true);
  const created = data(await call(one, "create_task_note", { content: "正文".repeat(40000), title: "Agent note" }));
  assert.equal(created.version, 1);assert.equal(created.origin, "agent");assert.equal(created.sessionId, "agent-one");assert.equal(created.sortOrder, 0);
  assert.ok(created.createdAt);assert.equal(created.updatedAt, created.createdAt);assert.equal(published.length, 1);
  assert.equal(JSON.parse(await readFile(contextPath, "utf8")).notes[0].version, 1);
  const index = data(await call(peer, "get_task_context"));assert.equal(index.notes[0].version, 1);assert.equal(index.notes[0].content, undefined);
  assert.equal(data(await call(peer, "get_task_note", { noteId: created.id })).content, created.content);
  const edited = data(await call(peer, "update_task_note", { noteId: created.id, version: 1, content: "Updated" }));
  assert.equal(edited.version, 2);assert.equal(edited.title, "Agent note");assert.equal(edited.sessionId, "agent-one");assert.equal(edited.createdAt, created.createdAt);
  assert.equal(JSON.parse(await readFile(contextPath, "utf8")).notes[0].content, "Updated");
  const stale = await call(one, "delete_task_note", { noteId: created.id, version: 1 });
  assert.equal(stale.isError, true);assert.equal(data(stale).currentVersion, 2);assert.equal(published.length, 2);
  for (const [name, args] of [
    ["create_task_note", { content: "wrong task", taskId: "other" }],
    ["create_task_note", { content: "spoof", sessionId: "other" }],
    ["create_task_note", { content: "valid", title: null }],
    ["create_task_note", { content: " " }],
    ["create_task_note", { content: "x".repeat(100001) }],
    ["update_task_note", { noteId: created.id, content: "no version" }],
    ["update_task_note", { noteId: created.id, version: 2, sortOrder: -1 }],
    ["update_task_note", { noteId: created.id, version: 2, path: "/tmp/x" }],
    ["delete_task_note", { noteId: "task-prompt", version: 1 }],
  ]) assert.equal((await call(one, name, args)).isError, true, name + JSON.stringify(args).slice(0,100));
  for (const name of ["get_task_note", "update_task_note", "delete_task_note"]) {
    assert.equal((await call(other, name, { noteId: created.id, ...(name === "get_task_note" ? {} : { version: 2, ...(name === "update_task_note" ? { content: "cross task" } : {}) }) })).isError, true);
  }
  const removed = data(await call(peer, "delete_task_note", { noteId: created.id, version: 2 }));
  assert.equal(removed.deleted, true);assert.equal((await task()).notes.length, 0);assert.equal(published.length, 3);
  assert.deepEqual(JSON.parse(await readFile(contextPath, "utf8")).notes, []);
  assert.equal((await call(one, "get_task_note", { noteId: created.id })).isError, true);
  let release;gate = new Promise(resolve => { release = resolve; });const started = new Promise(resolve => { entered = resolve; });
  const waiting = call(one, "create_task_note", { content: "must not commit" });await started;server.revoke("agent-one");release();
  assert.equal((await waiting).isError, true);assert.equal((await task()).notes.length, 0);assert.equal(published.length, 3);gate = undefined;
  assert.equal((await rpc(one, "tools/list")).status, 401);
  await tasks.recordDeletion(base.id, { resourceId: "repo", worktree: "kept", branch: "kept" });
  assert.equal(data(await call(peer, "create_task_note", { content: "deleting" })).code, "TASK_BUSY");
  await tasks.update(items => items.map(item => item.id === "other" ? { ...item, status: "ARCHIVED" } : item));
  assert.equal((await rpc(other, "tools/call", { name: "create_task_note", arguments: { content: "archived" } })).status, 401);
});
