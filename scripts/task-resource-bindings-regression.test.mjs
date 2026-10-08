import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { TaskRepository } = load("src/main-process/services/taskRepository.ts");
const { TaskResourceBindings } = load("src/main-process/services/taskResourceBindings.ts");
const { openAppDatabase } = load("src/main-process/services/appDatabase.ts");
const { taskPrompt } = load("src/main-process/services/taskSessions/taskContext.ts");
const task = { id: "existing", title: "Existing task", description: "original", date: "2026-10-07", projectName: "repo", status: "TODO" };
const input = (changes = {}) => ({ requestId: randomUUID(), links: [], webLinks: [], notes: [], fileIds: [], ...changes });

async function fixture(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-resource-bindings-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "app.db");
  const tasks = new TaskRepository(filename, "test");
  await tasks.importLegacy([task, { ...task, id: "other" }]);
  return { directory, filename, tasks, bindings: new TaskResourceBindings(tasks, filename, "test") };
}

test("资源原子追加、重试幂等、任务及命名空间隔离，笔记与文件进入新会话上下文", async (context) => {
  const { directory, filename, tasks, bindings } = await fixture(context);
  const original = path.join(directory, "spec.txt");await writeFile(original, "original file");
  const before = await stat(original);
  const file = await bindings.files.select(1, original);
  const note = { id: randomUUID(), title: "", content: "# Notes\nTask context" };
  const issue = { id: "issue", title: "Issue", projectName: "repo", date: "2026-10-07", group: "ISSUE", tag: "feature", status: "todo" };
  const payload = input({ links: [issue], webLinks: [{ id: randomUUID(), title: "Spec", url: "https://example.com/spec" }], notes: [note], fileIds: [file.id] });
  const updated = await bindings.add(task.id, payload, 1);
  assert.equal(updated.title, task.title);assert.equal(updated.description, task.description);assert.equal(updated.status, task.status);
  assert.equal(updated.links.length, 1);assert.deepEqual(updated.notes, [note]);assert.equal(updated.files[0].path, file.path);
  assert.equal((await bindings.add(task.id, payload, 1)).notes.length, 1);
  assert.equal((await tasks.load()).find((item) => item.id === "other").notes.length, 0);
  assert.match(taskPrompt(updated), /Task context/);assert.ok(taskPrompt(updated).includes(file.path));
  assert.equal(await readFile(original, "utf8"), "original file");assert.equal((await stat(original)).mtimeMs, before.mtimeMs);
  const reloaded = new TaskRepository(filename, "test");assert.equal((await reloaded.load())[0].files[0].path, file.path);
  const isolated = new TaskRepository(filename, "other");await isolated.importLegacy([task]);assert.equal((await isolated.load())[0].notes.length, 0);
  await tasks.completeDeletion(task.id);
  const database = await openAppDatabase(filename);
  try {
    for (const table of ["task_notes", "task_file_references", "task_resource_batches"]) assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE namespace='test' AND task_id=?`).get(task.id).count, 0);
  } finally { database.close(); }
  assert.equal(await readFile(original, "utf8"), "original file");
});

test("原文件由窗口令牌授权，失效/跨窗口/任意路径提交不能绑定", async (context) => {
  const { directory, bindings } = await fixture(context);
  const original = path.join(directory, "document.txt");await writeFile(original, "keep");
  const file = await bindings.files.select(1, original);
  await assert.rejects(bindings.add(task.id, input({ fileIds: [file.id] }), 2), /ATTACHMENT_MISSING/);
  await assert.rejects(bindings.add(task.id, input({ fileIds: [original] }), 1), /INVALID/);
  bindings.files.release(1, [file.id]);
  await assert.rejects(bindings.add(task.id, input({ fileIds: [file.id] }), 1), /ATTACHMENT_MISSING/);
  const deleted = await bindings.files.select(1, original);await rm(original);
  await assert.rejects(bindings.add(task.id, input({ fileIds: [deleted.id] }), 1));
});

test("重复资源不会重复关联；事务失败不留下半份资源，缺失任务不可添加", async (context) => {
  const { directory, tasks, bindings } = await fixture(context);
  const original = path.join(directory, "file.txt");await writeFile(original, "keep");
  let file = await bindings.files.select(1, original);
  const note = { id: randomUUID(), title: "Note", content: "keep" };
  await bindings.add(task.id, input({ notes: [note], fileIds: [file.id], webLinks: [{ id: randomUUID(), title: "", url: "https://example.com" }] }), 1);
  file = await bindings.files.select(1, original);
  const repeated = await bindings.add(task.id, input({ fileIds: [file.id], webLinks: [{ id: randomUUID(), title: "Duplicate", url: "https://example.com/" }] }), 1);
  assert.equal(repeated.files.length, 1);assert.equal(repeated.webLinks.length, 1);
  await assert.rejects(bindings.add(task.id, input({ notes: [note], webLinks: [{ id: randomUUID(), title: "rollback", url: "https://example.com/rollback" }] }), 1));
  assert.equal((await tasks.load()).find((item) => item.id === task.id).webLinks.length, 1);
  await assert.rejects(bindings.add("missing", input({ notes: [{ ...note, id: randomUUID() }] }), 1), /NOT_FOUND/);
  await assert.rejects(bindings.add(task.id, input({ notes: [{ ...note, content: " " }] }), 1), /INVALID/);
  await assert.rejects(bindings.add(task.id, input({ webLinks: [{ id: randomUUID(), title: "", url: "javascript:alert(1)" }] }), 1), /INVALID/);
});

test("v9 任务库升级资源表后保留既有任务，不生成笔记或文件占位数据", async (context) => {
  const { filename, tasks } = await fixture(context);
  let database = await openAppDatabase(filename);
  database.exec("DROP TABLE task_resource_batches; DROP TABLE task_notes; DROP TABLE task_file_references; PRAGMA user_version=9");database.close();
  database = await openAppDatabase(filename);
  assert.equal(database.prepare("PRAGMA user_version").get().user_version, 11);database.close();
  const migrated = await tasks.load();
  assert.equal(migrated.length, 2);assert.equal(migrated[0].title, task.title);
  assert.deepEqual(migrated[0].notes, []);assert.deepEqual(migrated[0].files, []);
});
