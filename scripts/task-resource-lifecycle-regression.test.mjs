import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { TaskRepository } = load("src/main-process/services/taskRepository.ts");
const { TaskResourceBindings } = load("src/main-process/services/taskResourceBindings.ts");
const { TaskResourceLifecycleService } = load("src/main-process/services/taskResourceLifecycleService.ts");
const { openAppDatabase } = load("src/main-process/services/appDatabase.ts");
const { TaskContextFiles } = load("src/main-process/services/taskSessions/taskContextFiles.ts");
const { TaskContextServer } = load("src/main-process/services/taskSessions/taskContextServer.ts");
const { aggregateTaskWebLinks } = load("src/utils/taskWebLinks.ts");
const { proposedManagedFileName } = load("src/utils/taskManagedFileName.ts");

const issue = (id, group, status, title = id) => ({
  id, title, group, tag: "feature", status, projectName: "navo", provider: "GitHub", date: "2026-10-07",
});
const resource = (resourceId, mode, workingPath) => ({
  resourceId, name: resourceId, mode, workingPath, originalPath: workingPath, sourceBranch: mode === "folder" ? "" : "main", targetBranch: mode === "folder" ? "" : "main",
});

async function fixture(context, { busyIds = [] } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-resource-lifecycle-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "app.db");
  const userData = path.join(directory, "data");
  const tasks = new TaskRepository(filename, "test");
  const noteId = randomUUID();
  const fileId = randomUUID();
  const missingId = randomUUID();
  const attachmentId = randomUUID();
  const linkA = randomUUID();
  const linkB = randomUUID();
  const storageName = `${attachmentId}.txt`;
  const original = path.join(directory, "spec.md");
  const missing = path.join(directory, "gone.txt");
  await writeFile(original, "# hello\n");
  await mkdir(path.join(directory, "folder-b"));
  await mkdir(path.join(directory, "folder-c"));
  const attachmentDir = path.join(userData, "task-files", "test", "existing");
  await mkdir(attachmentDir, { recursive: true });
  const attachmentPath = path.join(attachmentDir, storageName);
  await writeFile(attachmentPath, "copy");
  const task = {
    id: "existing", title: "Lifecycle", date: "2026-10-07", updatedAt: "2026-10-07T00:00:00.000Z", projectName: "navo", status: "TODO", description: "prompt",
    resources: [resource("repo-a", "current-branch", path.join(directory, "repo-a")), resource("repo-b", "folder", path.join(directory, "folder-b")), resource("repo-c", "folder", path.join(directory, "folder-c"))],
    links: [issue("pr-merged", "PR", "merged", "Merged PR"), issue("pr-open", "PR", "open", "Open PR"), issue("issue-one", "ISSUE", "todo", "Issue")],
    webLinks: [
      { id: linkA, url: "https://example.com/spec", title: "Spec" },
      { id: linkB, url: "https://example.com/spec", title: "" },
    ],
  };
  await tasks.create(task, [{ id: attachmentId, name: "copy.txt", size: 4, storageName }]);
  const bindings = new TaskResourceBindings(tasks, filename, "test");
  const file = await bindings.files.select(1, original);
  const added = await bindings.add("existing", {
    requestId: randomUUID(), links: [], webLinks: [], notes: [{ id: noteId, title: "Rules", content: "keep private" }], fileIds: [file.id],
  }, 1);
  const database = await openAppDatabase(filename);
  try {
    database.prepare("INSERT INTO task_file_references (namespace,task_id,id,name,path,size) VALUES (?,?,?,?,?,?)")
      .run("test", "existing", missingId, "gone.txt", missing, 0);
  } finally { database.close(); }
  const lifecycle = new TaskResourceLifecycleService(tasks, filename, "test", userData, (_taskId, resourceId) => busyIds.includes(resourceId));
  return {
    directory, filename, userData, tasks, bindings, lifecycle, original, attachmentPath, attachmentDir, storageName,
    ids: { noteId, fileId: added.files[0].id, missingId, attachmentId, linkA, linkB },
    contextVersion: added.contextVersion ?? 1,
  };
}

const filenameOf = (instructions) => JSON.parse(instructions.split("\n")[1]);
const readJson = async (location) => JSON.parse(await readFile(location, "utf8"));

test("归档与恢复会从活动列表、上下文文件和 MCP get_task_context 中移除或恢复条目，并提高 contextVersion", async (context) => {
  const { lifecycle, tasks, directory, ids } = await fixture(context);
  const before = (await tasks.load()).find((item) => item.id === "existing");
  const archived = await lifecycle.archiveResources("existing", [
    { kind: "note", id: ids.noteId }, { kind: "file", id: ids.fileId }, { kind: "attachment", id: ids.attachmentId }, { kind: "link", id: ids.linkA },
  ], 1);
  assert.equal(archived.applied.length, 5, "duplicate URL expands to both link rows");
  const after = archived.task;
  assert.ok((after.contextVersion ?? 0) > (before.contextVersion ?? 0));
  assert.equal(after.notes.length, 0); assert.equal(after.archivedNotes.length, 1);
  assert.ok(!after.files.some((file) => file.id === ids.fileId));
  assert.ok(after.archivedFiles.some((file) => file.id === ids.fileId));
  assert.equal((after.attachments ?? []).length, 0); assert.equal(after.archivedAttachments.length, 1);
  assert.equal((after.webLinks ?? []).length, 0); assert.equal(after.archivedWebLinks.length, 2);
  const files = new TaskContextFiles();
  context.after(() => files.close());
  const live = filenameOf(await files.prepare("session-one", after, directory, []));
  const payload = await readJson(live);
  assert.deepEqual(payload.notes, []); assert.deepEqual(payload.attachments, []); assert.deepEqual(payload.links, []);
  assert.ok(!payload.files.some((file) => file.id === ids.fileId));
  const server = new TaskContextServer(async () => (await tasks.load()).find((item) => item.id === "existing"));
  context.after(() => server.close());
  const connection = await server.connect("session-one", "existing");
  const mcp = (method, params = {}) => fetch(connection.url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${connection.token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((response) => response.json());
  await mcp("initialize", { protocolVersion: "2025-03-26" });
  const listed = await mcp("tools/call", { name: "get_task_context", arguments: {} });
  assert.equal(listed.result.isError, undefined, JSON.stringify(listed));
  const contextPayload = JSON.parse(listed.result.content[0].text);
  assert.equal(contextPayload.notes.length, 0);
  assert.ok(!(contextPayload.files ?? []).some((file) => file.id === ids.fileId));
  assert.equal((contextPayload.links ?? []).length, 0);
  assert.ok(!JSON.stringify(contextPayload).includes("keep private"));
  const restored = await lifecycle.restoreResources("existing", [{ kind: "note", id: ids.noteId }], 1);
  assert.equal(restored.task.notes[0].id, ids.noteId);
  assert.equal(restored.task.archivedNotes.length, 0);
});

test("附件删除会在撤销失效后移除托管副本，路径解除关联不删除原文件；撤销可恢复缺失文件引用", async (context) => {
  const { lifecycle, original, attachmentPath, ids } = await fixture(context);
  const before = (await stat(original)).mtimeMs;
  const detached = await lifecycle.detachResources("existing", [{ kind: "file", id: ids.fileId }], 1);
  assert.ok(detached.applied.some((item) => item.id === ids.fileId));
  assert.equal(await readFile(original, "utf8"), "# hello\n");
  assert.equal((await stat(original)).mtimeMs, before);
  await lifecycle.undo("existing", 1);
  const deleted = await lifecycle.deleteAttachments("existing", [ids.attachmentId], 1);
  assert.ok(deleted.applied.some((item) => item.id === ids.attachmentId));
  assert.equal(deleted.task.attachments.length, 0);
  assert.ok(existsSync(attachmentPath), "copy stays until undo expires");
  const undone = await lifecycle.undo("existing", 1);
  assert.equal(undone.attachments[0].id, ids.attachmentId);
  assert.ok(existsSync(attachmentPath));
  await lifecycle.deleteAttachments("existing", [ids.attachmentId], 1);
  await rm(attachmentPath, { force: true });
  await assert.rejects(lifecycle.undo("existing", 1), /TASK_UNDO_EXPIRED/);
});

test("清理缺失文件和本地已是 merged 的 PR，不把未合并或未知状态算进去", async (context) => {
  const { lifecycle, ids, tasks, bindings, directory } = await fixture(context);
  const plan = await lifecycle.inspectCleanup("existing");
  assert.ok(plan.missingFiles.some((item) => item.id === ids.missingId && item.kind === "file"));
  assert.ok(plan.mergedPullRequests.some((item) => item.id === "pr-merged"));
  assert.ok(!plan.mergedPullRequests.some((item) => item.id === "pr-open"));
  const before = (await tasks.load()).find((item) => item.id === "existing");
  const manual = await lifecycle.archiveResources("existing", [{ kind: "issue", id: "pr-open" }], 1);
  assert.ok(manual.skipped.some((item) => item.id === "pr-open" && item.reason === "notAllowed"));
  assert.ok(manual.task.links.some((item) => item.id === "pr-open" && !item.archivedAt));
  const applied = await lifecycle.applyCleanup("existing", 1);
  assert.ok(applied.applied.some((item) => item.id === ids.missingId));
  assert.ok(applied.applied.some((item) => item.id === "pr-merged"));
  assert.ok(!applied.applied.some((item) => item.id === "pr-open"));
  assert.ok(!applied.task.files.some((file) => file.id === ids.missingId));
  assert.ok(!applied.task.links.some((item) => item.id === "pr-merged"));
  assert.ok((applied.task.archivedLinks ?? []).some((item) => item.id === "pr-merged" && item.archivedAt));
  assert.ok(applied.task.links.some((item) => item.id === "pr-open"));
  assert.ok((applied.task.contextVersion ?? 0) > (before.contextVersion ?? 0));
  const files = new TaskContextFiles();
  context.after(() => files.close());
  const payload = await readJson(filenameOf(await files.prepare("session-cleanup", applied.task, directory, [])));
  assert.ok(!payload.issues.some((item) => item.id === "pr-merged"));
  assert.ok(payload.issues.some((item) => item.id === "pr-open"));
  const restored = await lifecycle.restoreResources("existing", [{ kind: "issue", id: "pr-merged" }], 1);
  assert.ok(restored.task.links.some((item) => item.id === "pr-merged" && !item.archivedAt));
  assert.ok(!(restored.task.archivedLinks ?? []).some((item) => item.id === "pr-merged"));
  assert.ok((restored.task.contextVersion ?? 0) > (applied.task.contextVersion ?? 0));
  const recleaned = await lifecycle.applyCleanup("existing", 1);
  assert.ok((recleaned.task.archivedLinks ?? []).some((item) => item.id === "pr-merged"));
  lifecycle.invalidateTask("existing");
  await assert.rejects(lifecycle.undo("existing", 1), /TASK_UNDO_EXPIRED/);
  const afterExpiry = (await tasks.load()).find((item) => item.id === "existing");
  assert.ok((afterExpiry.archivedLinks ?? []).some((item) => item.id === "pr-merged"));
  const readded = await bindings.add("existing", {
    requestId: randomUUID(), links: [issue("pr-merged", "PR", "merged", "Merged PR")], webLinks: [], notes: [], fileIds: [],
  }, 1);
  assert.ok((readded.archivedLinks ?? []).some((item) => item.id === "pr-merged" && item.archivedAt));
  assert.ok(!(readded.links ?? []).some((item) => item.id === "pr-merged"));
  const recovered = await lifecycle.restoreResources("existing", [{ kind: "issue", id: "pr-merged" }], 1);
  assert.ok(recovered.task.links.some((item) => item.id === "pr-merged" && !item.archivedAt));
  assert.ok(!(recovered.task.archivedLinks ?? []).some((item) => item.id === "pr-merged"));
});

test("清理已关闭 Issue 与失效普通文件夹，跳过占用目录，撤销恢复关联和上下文", async (context) => {
  const target = await fixture(context, { busyIds: ["repo-c"] });
  context.after(() => target.lifecycle.forgetOwner(1));
  await target.bindings.add("existing", { requestId: randomUUID(), links: [issue("issue-closed", "ISSUE", "closed")], notes: [], webLinks: [], fileIds: [] }, 1);
  await rm(path.join(target.directory, "folder-b"), { recursive: true });
  await rm(path.join(target.directory, "folder-c"), { recursive: true });
  const plan = await target.lifecycle.inspectCleanup("existing");
  assert.deepEqual(plan.closedIssues.map((item) => item.id), ["issue-closed"]);
  assert.deepEqual(plan.missingFolders.map((item) => item.id), ["repo-b"]);
  const result = await target.lifecycle.applyCleanup("existing", 1);
  assert.ok(!result.task.resources.some((item) => item.resourceId === "repo-b"));
  assert.ok(result.task.resources.some((item) => item.resourceId === "repo-c"));
  assert.ok(result.task.resources.some((item) => item.resourceId === "repo-a"));
  assert.ok(result.task.archivedLinks.some((item) => item.id === "issue-closed"));
  assert.ok(result.task.links.some((item) => item.id === "issue-one"));
  const restored = await target.lifecycle.undo("existing", 1);
  assert.ok(restored.resources.some((item) => item.resourceId === "repo-b"));
  assert.ok(restored.links.some((item) => item.id === "issue-closed"));
  assert.equal(await readFile(target.original, "utf8"), "# hello\n");
});

test("清理执行时重新核对已恢复路径和 Issue 状态，并保留最后一个普通目录", async (context) => {
  const target = await fixture(context);
  context.after(() => target.lifecycle.forgetOwner(1));
  await target.bindings.add("existing", { requestId: randomUUID(), links: [issue("issue-closed", "ISSUE", "closed")], notes: [], webLinks: [], fileIds: [] }, 1);
  await rm(path.join(target.directory, "folder-b"), { recursive: true });
  assert.equal((await target.lifecycle.inspectCleanup("existing")).missingFolders.length, 1);
  await mkdir(path.join(target.directory, "folder-b"));
  const database = await openAppDatabase(target.filename);
  database.prepare("UPDATE task_links SET data=? WHERE namespace=? AND task_id=? AND link_id=?").run(JSON.stringify(issue("issue-closed", "ISSUE", "todo")), "test", "existing", "issue-closed");
  database.close();
  const changed = await target.lifecycle.applyCleanup("existing", 1);
  assert.ok(changed.task.resources.some((item) => item.resourceId === "repo-b"));
  assert.ok(changed.task.links.some((item) => item.id === "issue-closed"));
  await target.lifecycle.detachResources("existing", [{ kind: "workspace", id: "repo-a" }], 1);
  await rm(path.join(target.directory, "folder-b"), { recursive: true });
  await rm(path.join(target.directory, "folder-c"), { recursive: true });
  assert.equal((await target.lifecycle.inspectCleanup("existing")).missingFolders.length, 2);
  const last = await target.lifecycle.applyCleanup("existing", 1);
  assert.equal(last.task.resources.length, 1);
  assert.ok(last.skipped.some((item) => item.reason === "lastWorkspace"));
  assert.equal((await target.lifecycle.inspectCleanup("existing")).missingFolders.length, 0);
});

test("inspect 与预览只读取文件前缀，大图先按 stat 限制大小", async (context) => {
  const { lifecycle, bindings, directory } = await fixture(context);
  const hugeText = path.join(directory, "huge.txt");
  const textHandle = await open(hugeText, "w");
  await textHandle.write("hello text\n" + "x".repeat(16 * 1024));
  await textHandle.truncate(30 * 1024 * 1024);
  await textHandle.close();
  const textFile = await bindings.files.select(1, hugeText);
  const withText = await bindings.add("existing", { requestId: randomUUID(), links: [], webLinks: [], notes: [], fileIds: [textFile.id] }, 1);
  const textId = textFile.id;
  assert.ok(withText.files.some((item) => item.id === textId));
  const inspected = await lifecycle.inspectFile("existing", "file", textId);
  assert.equal(inspected.previewType, "text");
  assert.equal(inspected.size, 30 * 1024 * 1024);
  const preview = await lifecycle.previewFile("existing", "file", textId);
  assert.equal(preview.type, "text");
  assert.equal(preview.truncated, true);
  assert.equal(preview.size, 30 * 1024 * 1024);
  assert.ok(preview.text.startsWith("hello text"));
  assert.ok(Buffer.byteLength(preview.text, "utf8") <= 512 * 1024);
  const hugeImage = path.join(directory, "huge.png");
  const imageHandle = await open(hugeImage, "w");
  await imageHandle.write(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  await imageHandle.truncate(25 * 1024 * 1024);
  await imageHandle.close();
  const imageFile = await bindings.files.select(1, hugeImage);
  const withImage = await bindings.add("existing", { requestId: randomUUID(), links: [], webLinks: [], notes: [], fileIds: [imageFile.id] }, 1);
  const imageId = imageFile.id;
  assert.ok(withImage.files.some((item) => item.id === imageId));
  const imageInspected = await lifecycle.inspectFile("existing", "file", imageId);
  assert.equal(imageInspected.previewType, "image");
  assert.equal(imageInspected.size, 25 * 1024 * 1024);
  const imagePreview = await lifecycle.previewFile("existing", "file", imageId);
  assert.equal(imagePreview.type, "unsupported");
  assert.equal(imagePreview.size, 25 * 1024 * 1024);
  assert.equal(imagePreview.dataUrl, undefined);
});

test("批量解除会跳过最后工作区和占用中的目录，后续编辑会使撤销失效", async (context) => {
  const { lifecycle, ids } = await fixture(context, { busyIds: ["repo-b"] });
  const busy = await lifecycle.detachResources("existing", [{ kind: "workspace", id: "repo-b" }], 1);
  assert.ok(busy.skipped.some((item) => item.id === "repo-b" && item.reason === "workspaceBusy"));
  assert.equal(busy.applied.length, 0);
  const detached = await lifecycle.detachResources("existing", [{ kind: "workspace", id: "repo-a" }, { kind: "workspace", id: "repo-c" }], 1);
  assert.deepEqual(detached.applied.map((item) => item.id).sort(), ["repo-a", "repo-c"]);
  const last = await lifecycle.detachResources("existing", [{ kind: "workspace", id: "repo-b" }], 1);
  assert.ok(last.skipped.some((item) => item.id === "repo-b" && item.reason === "lastWorkspace"));
  assert.equal(last.applied.length, 0);
  await lifecycle.archiveResources("existing", [{ kind: "note", id: ids.noteId }], 1);
  await lifecycle.updateFileMeta("existing", "file", ids.fileId, { description: "later edit" });
  await assert.rejects(lifecycle.undo("existing", 1), /TASK_UNDO_EXPIRED/);
});


test("显示名修改不改原路径；附件改名冲突被拒绝；链接标题更新作用于同一 URL 聚合；inspect 拒绝原始路径", async (context) => {
  const { lifecycle, filename, original, attachmentDir, storageName, ids } = await fixture(context);
  const renamed = await lifecycle.updateFileMeta("existing", "file", ids.fileId, { name: "renamed-spec.md", description: "from path" });
  const file = renamed.files.find((item) => item.id === ids.fileId);
  assert.equal(file.name, "renamed-spec.md");
  assert.equal(path.basename(file.path), 'spec.md');
  assert.notEqual(file.name, path.basename(file.path));
  assert.ok(file.path.endsWith('spec.md'));
  assert.equal(file.description, "from path");
  assert.equal(path.basename(original), "spec.md");
  const otherId = randomUUID();
  await writeFile(path.join(attachmentDir, "taken.txt"), "taken");
  const database = await openAppDatabase(filename);
  try {
    database.prepare("INSERT INTO task_attachments (namespace,task_id,id,name,size,storage_name) VALUES (?,?,?,?,?,?)").run("test", "existing", otherId, "taken.txt", 5, "taken.txt");
  } finally { database.close(); }
  await assert.rejects(lifecycle.updateFileMeta("existing", "attachment", ids.attachmentId, { name: "taken.txt" }), /TASK_FILE_RENAME_COLLISION/);
  assert.ok(existsSync(path.join(attachmentDir, storageName)));
  const updated = await lifecycle.updateWebLink("existing", ids.linkB, "Shared title");
  assert.equal(updated.webLinks.length, 2);
  assert.ok(updated.webLinks.every((link) => link.title === "Shared title"));
  const aggregated = aggregateTaskWebLinks(updated.webLinks);
  assert.equal(aggregated.length, 1);
  assert.deepEqual(aggregated[0].ids.sort(), [ids.linkA, ids.linkB].sort());
  await assert.rejects(lifecycle.inspectFile("existing", "file", original), /TASK_INVALID/);
  await assert.rejects(lifecycle.inspectFile("existing", "file", "../secret"), /TASK_INVALID/);
  assert.deepEqual(proposedManagedFileName("", "a.txt"), { reason: "empty" });
  assert.deepEqual(proposedManagedFileName("a/b", "a.txt"), { reason: "separator" });
});

test("解除关联允许 Issue 缓存键中的仓库路径斜杠，文件 id 仍拒绝斜杠", async (context) => {
  const { lifecycle, tasks, bindings } = await fixture(context);
  const item = issue("github:github.com:leezhian/resume-session:ISSUE:3", "ISSUE", "todo", "test");
  await bindings.add("existing", { requestId: randomUUID(), links: [item], webLinks: [], notes: [], fileIds: [] }, 1);
  const detached = await lifecycle.detachResources("existing", [{ kind: "issue", id: item.id }], 1);
  assert.ok(detached.applied.some((entry) => entry.id === item.id));
  const after = (await tasks.load()).find((task) => task.id === "existing");
  assert.ok(!(after.links ?? []).some((link) => link.id === item.id));
  await assert.rejects(
    lifecycle.detachResources("existing", [{ kind: "file", id: "folder/secret" }], 1),
    (error) => error instanceof Error && error.message === "TASK_INVALID",
  );
});
