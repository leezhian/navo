import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { TaskRepository } = load("src/main-process/services/taskRepository.ts");
const { TaskNoteRepository } = load("src/main-process/services/taskNoteRepository.ts");
const { TaskResourceBindings } = load("src/main-process/services/taskResourceBindings.ts");
const { TaskResourceLifecycleService } = load("src/main-process/services/taskResourceLifecycleService.ts");
const { openAppDatabase, APP_SCHEMA_VERSION } = load("src/main-process/services/appDatabase.ts");
const { taskPrompt } = load("src/main-process/services/taskSessions/taskContext.ts");
const { TaskIssueLinker } = load("src/main-process/services/integrations/taskIssueLinker.ts");

async function fixture(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-deleted-notes-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "app.db");
  const tasks = new TaskRepository(filename, "test");
  const notes = new TaskNoteRepository(filename, "test");
  const bindings = new TaskResourceBindings(tasks, filename, "test");
  const base = { id: "task", title: "Task", description: "Prompt", status: "TODO", projectName: "", date: "2026-11-19", updatedAt: "2026-11-19T00:00:00.000Z" };
  await tasks.create(base, []);
  const note = { id: randomUUID(), title: "Saved note", content: "Original private content" };
  await bindings.add(base.id, { requestId: randomUUID(), notes: [note], links: [], webLinks: [], fileIds: [] }, 1);
  const current = async () => (await tasks.load()).find((task) => task.id === base.id);
  return { filename, directory, tasks, notes, bindings, base, note, current };
}

test("软删除保留正文、历史和评论，退出上下文；可从旧版本恢复并保留作者与新版本并发锁", async (context) => {
  const target = await fixture(context);
  const comment = { id: randomUUID(), noteId: target.note.id, noteVersion: 1, startLine: 1, endLine: 1, quote: target.note.content, body: "Keep this feedback" };
  await target.notes.comment("task", comment);
  await target.notes.update("task", { ...target.note, content: "Agent edit" }, 1, undefined, "agent-1");
  await target.notes.remove("task", target.note.id, 2);
  const deleted = await target.bindings.deletedNotes("task");
  assert.equal(deleted.length, 1);
  assert.ok(deleted[0].deletedAt);
  assert.equal(deleted[0].comments[0].body, comment.body);
  assert.equal(deleted[0].lastEditorSessionId, "agent-1");
  assert.deepEqual((await target.current()).notes, []);
  assert.ok(!taskPrompt(await target.current()).includes("Agent edit"));
  assert.equal((await target.notes.history("task", target.note.id)).length, 2);
  await assert.rejects(target.notes.update("task", target.note, 2), /TASK_NOTE_NOT_FOUND/);
  await assert.rejects(target.notes.restore("task", target.note.id, 1, 2), /TASK_NOTE_NOT_FOUND/);
  await assert.rejects(target.notes.changeComment("task", comment.id, deleted[0].comments[0].updatedAt, { resolved: true }), /TASK_NOTE_NOT_FOUND/);
  await assert.rejects(target.notes.restoreDeleted("task", target.note.id, 1), /TASK_CONTENT_CHANGED/);
  const restored = await target.bindings.restoreDeletedNote("task", target.note.id, 2, 1);
  assert.equal(restored.notes[0].content, target.note.content);
  assert.equal(restored.notes[0].version, 3);
  assert.equal(restored.notes[0].origin, "user");
  assert.equal(restored.notes[0].comments.length, 1);
  assert.equal(restored.notes[0].deletedAt, undefined);
  assert.equal((await target.notes.history("task", target.note.id))[0].restoredFrom, 1);
  assert.equal((await target.notes.deleted("task")).length, 0);
  await assert.rejects(target.notes.remove("task", target.note.id, 2), /TASK_CONTENT_CHANGED/);
});

test("批量软删除原子校验，Prompt、其他任务和其他命名空间不可删除；归档任务不可恢复", async (context) => {
  const target = await fixture(context);
  const second = { id: randomUUID(), title: "Second", content: "Second body" };
  await target.bindings.add("task", { requestId: randomUUID(), notes: [second], links: [], webLinks: [], fileIds: [] }, 1);
  await assert.rejects(target.bindings.deleteNotes("task", [{ id: target.note.id, version: 1 }, { id: second.id, version: 2 }]), /TASK_CONTENT_CHANGED/);
  assert.equal((await target.current()).notes.length, 2);
  await assert.rejects(target.bindings.deleteNotes("task", [{ id: "task-prompt", version: 1 }]), /TASK_INVALID/);
  await target.tasks.create({ ...target.base, id: "other" }, []);
  await assert.rejects(target.bindings.deleteNotes("other", [{ id: target.note.id, version: 1 }]), /TASK_NOTE_NOT_FOUND/);
  await target.bindings.deleteNotes("task", [{ id: target.note.id, version: 1 }, { id: second.id, version: 1 }]);
  assert.equal((await target.current()).notes.length, 0);
  assert.equal((await target.notes.deleted("task")).length, 2);
  assert.equal((await new TaskNoteRepository(target.filename, "production").deleted("task")).length, 0);
  await target.tasks.update((tasks) => tasks.map((task) => task.id === "task" ? { ...task, status: "ARCHIVED" } : task));
  assert.equal((await target.bindings.deletedNotes("task")).length, 2);
  await assert.rejects(target.bindings.restoreDeletedNote("task", target.note.id, 1), /TASK_BUSY/);
});

test("18 升级保留既有笔记与历史；归档笔记软删除后恢复到活动列表，普通资源恢复不能绕过回收状态", async (context) => {
  const target = await fixture(context);
  const lifecycle = new TaskResourceLifecycleService(target.tasks, target.filename, "test", target.directory);
  context.after(() => lifecycle.forgetOwner(1));
  await lifecycle.archiveResources("task", [{ kind: "note", id: target.note.id }], 1);
  const database = await openAppDatabase(target.filename);
  database.exec("ALTER TABLE task_notes DROP COLUMN deleted_at; PRAGMA user_version=18");
  database.close();
  const migrated = await openAppDatabase(target.filename);
  assert.equal(migrated.prepare("PRAGMA user_version").get().user_version, APP_SCHEMA_VERSION);
  assert.equal(migrated.prepare("SELECT deleted_at FROM task_notes WHERE id=?").get(target.note.id).deleted_at, null);
  migrated.close();
  assert.equal((await target.current()).archivedNotes.length, 1);
  await target.bindings.deleteNote("task", target.note.id, 1);
  const forbidden = await lifecycle.restoreResources("task", [{ kind: "note", id: target.note.id }], 1);
  assert.equal(forbidden.applied.length, 0);
  const restored = await target.bindings.restoreDeletedNote("task", target.note.id, 1);
  assert.equal(restored.notes[0].id, target.note.id);
  assert.equal(restored.archivedNotes.length, 0);
  assert.equal((await target.notes.history("task", target.note.id)).length, 2);
});

test("远端条目刷新同步任务和清理状态，保留归档/自动关联标记，不复活已解除关联或覆盖失败快照", async (context) => {
  const target = await fixture(context);
  const item = { id: "github:owner/repo:issue:1", title: "Open issue", group: "ISSUE", providerId: "github", provider: "GitHub", source: "remote", projectName: "repo", status: "todo", date: "2026-11-19" };
  const pullRequest = { ...item, id: "github:owner/repo:pr:2", group: "PR", title: "PR", autoLinked: true, archivedAt: "2026-11-18T00:00:00.000Z" };
  await target.bindings.add("task", { requestId: randomUUID(), notes: [], links: [item, pullRequest], webLinks: [], fileIds: [] }, 1);
  const published = [];
  const linker = new TaskIssueLinker({ filename: target.filename, namespace: "test", loadTasks: () => target.tasks.load(), publish: (task) => published.push(task) });
  await linker.refreshLinkedItem({ ...item, title: "Closed issue", status: "closed" });
  assert.equal((await target.current()).links.find((link) => link.id === item.id).status, "closed");
  assert.equal(published.length, 1);
  await linker.refreshLinkedItem({ ...pullRequest, archivedAt: undefined, autoLinked: false, title: "Merged PR", status: "merged" });
  const archived = (await target.current()).archivedLinks[0];
  assert.equal(archived.title, "Merged PR");assert.equal(archived.autoLinked, true);assert.equal(archived.archivedAt, pullRequest.archivedAt);
  await linker.refreshLinkedItem({ ...item, title: "Stale failed content", fetchError: "unreachable" });
  assert.equal((await target.current()).links[0].title, "Closed issue");
  const lifecycle = new TaskResourceLifecycleService(target.tasks, target.filename, "test", target.directory);
  context.after(() => lifecycle.forgetOwner(1));
  assert.deepEqual((await lifecycle.inspectCleanup("task")).closedIssues, [{ id: item.id, title: "Closed issue" }]);
  await lifecycle.detachResources("task", [{ kind: "issue", id: item.id }], 1);
  await linker.refreshLinkedItem({ ...item, status: "closed" });
  assert.equal((await target.current()).links.length, 0);
});

test("Issue 正文笔记软删除后不重复生成，仍可从回收区恢复原笔记", async (context) => {
  const target = await fixture(context);
  const item = { id: "remote-issue", title: "Issue body", group: "ISSUE", providerId: "github", source: "remote", projectName: "repo", status: "todo", date: "2026-11-19", body: "Remote body" };
  await target.bindings.add("task", { requestId: randomUUID(), notes: [], links: [item], webLinks: [], fileIds: [] }, 1);
  const linker = new TaskIssueLinker({ filename: target.filename, namespace: "test", loadTasks: () => target.tasks.load(), addResources: (id, input) => target.bindings.add(id, input, 1) });
  assert.equal(await linker.ensureIssueNote("task", item.id), "created");
  const note = (await target.current()).notes.find((note) => note.content.includes("Remote body"));
  await target.bindings.deleteNote("task", note.id, note.version);
  assert.equal(await linker.ensureIssueNote("task", item.id), "exists");
  assert.equal((await target.notes.deleted("task")).length, 1);
  const restored = await target.bindings.restoreDeletedNote("task", note.id, note.version);
  assert.equal(restored.notes.filter((item) => item.id === note.id).length, 1);
});
