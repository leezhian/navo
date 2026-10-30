import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { TaskRepository } = load("src/main-process/services/taskRepository.ts");
const { TaskContentRepository } = load("src/main-process/services/taskContentRepository.ts");
const { TaskResourceBindings } = load("src/main-process/services/taskResourceBindings.ts");
const { openAppDatabase } = load("src/main-process/services/appDatabase.ts");
const base = { id: "task", title: "Original title", description: "Original prompt", date: "2026-10-01", updatedAt: "2026-10-01", projectName: "repo", status: "TODO" };
async function fixture(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-content-test-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "app.db");
  const tasks = new TaskRepository(filename, "test");
  const content = new TaskContentRepository(filename, "test");
  const bindings = new TaskResourceBindings(tasks, filename, "test");
  await tasks.create(base, []);
  return { tasks, content, bindings, directory, filename };
}

test("Prompt uses description, preserves title, rejects stale writes and increments version only on changes", async context => {
  const { tasks, content, bindings, filename } = await fixture(context);
  await content.updatePrompt(base.id, "Edited prompt", base.description);
  let [task] = await tasks.load();
  assert.equal(task.description, "Edited prompt"); assert.equal(task.title, base.title); assert.equal(task.contextVersion, 2);
  await content.updatePrompt(base.id, task.description, task.description);
  await assert.rejects(content.updatePrompt(base.id, "overwrite", base.description), /CONTENT_CHANGED/);
  assert.equal((await tasks.load())[0].contextVersion, 2);
  const note = { id: randomUUID(), title: "Note", content: "body" };
  await bindings.add(base.id, { requestId: randomUUID(), notes: [note], links: [], webLinks: [], fileIds: [] }, 1);
  await bindings.updateNote(base.id, { ...note, content: "new body" }, note);
  await assert.rejects(bindings.updateNote(base.id, { ...note, content: "stale body" }, note), /CONTENT_CHANGED/);
  assert.equal((await tasks.load())[0].contextVersion, 4);
  const isolated = new TaskContentRepository(filename, "other");
  await assert.rejects(isolated.updatePrompt(base.id, "bad", "Edited prompt"), /NOT_FOUND/);
  await tasks.update(tasks => tasks.map(task => ({ ...task, status: "ARCHIVED" })));
  await assert.rejects(content.updatePrompt(base.id, "bad", "Edited prompt"), /BUSY/);
  await assert.rejects(bindings.add(base.id, { requestId: randomUUID(), notes: [{ ...note, id: randomUUID() }], links: [], webLinks: [], fileIds: [] }, 1), /BUSY/);
});

test("Unlink only removes task association and ownership, keeping workspaces and original files", async context => {
  const { tasks, content, directory, filename } = await fixture(context);
  const workspace = path.join(directory, "workspace"); await mkdir(workspace);
  const original = path.join(workspace, "keep.txt"); await writeFile(original, "keep");
  const resources = [{ resourceId: "workspace", name: "repo", mode: "worktree", workingPath: workspace, originalPath: workspace, sourceBranch: "main", targetBranch: "feature", ownership: { path: workspace } }];
  await tasks.create({ ...base, id: "bound", resources, webLinks: [{ id: "link", title: "Spec", url: "https://example.com" }] }, [{ id: "attachment", name: "keep.txt", size: 4, storageName: "copy.txt" }]);
  await content.detach("bound", { kind: "workspace", id: "workspace" });
  await content.detach("bound", { kind: "link", id: "link" });
  await content.detach("bound", { kind: "attachment", id: "attachment" });
  const task = (await tasks.load()).find(task => task.id === "bound");
  assert.equal(task.resources.length, 0); assert.equal(task.webLinks.length, 0); assert.equal(task.attachments.length, 0); assert.equal(task.projectName, "");
  assert.equal(task.contextVersion, 4); assert.equal(await readFile(original, "utf8"), "keep");
  const database = await openAppDatabase(filename);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM managed_workspaces WHERE task_id='bound'").get().count, 0); database.close();
  await assert.rejects(content.detach("bound", { kind: "task_notes; DROP TABLE tasks", id: "x" }), /INVALID/);
  assert.equal((await tasks.load()).length, 2);
});
