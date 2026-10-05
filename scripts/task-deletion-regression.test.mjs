import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader({ electron: { nativeImage: { createFromPath: () => ({ isEmpty: () => true }) } } });
const { TaskService } = load("src/main-process/services/taskService.ts");
const { ResourceService } = load("src/main-process/services/resourceService.ts");
const { defaultSettings } = load("src/domain/settings.ts");
const { openAppDatabase } = load("src/main-process/services/appDatabase.ts");
const execute = promisify(execFile);
const keep = { deleteWorktrees: false, deleteBranches: false };
const worktreeOnly = { deleteWorktrees: true, deleteBranches: false };
const everything = { deleteWorktrees: true, deleteBranches: true };
const git = async (cwd, ...args) => (await execute("git", args, { cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: os.devNull } })).stdout.trim();

async function fixture(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-delete-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const settings = { ...defaultSettings, worktreesDirectory: path.join(directory, "worktrees") };
  const service = new TaskService(directory, "production", () => settings);
  const resources = new ResourceService(path.join(directory, "resources.json"));
  async function repository(name) {
    const root = path.join(directory, name);
    await mkdir(root);
    await git(root, "init", "-b", "main");
    await git(root, "config", "user.name", "Test");
    await git(root, "config", "user.email", "test@example.invalid");
    await git(root, "config", "core.hooksPath", os.devNull);
    await writeFile(path.join(root, "file.txt"), "original");
    await writeFile(path.join(root, ".gitignore"), "ignored.txt\n");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "initial");
    await git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
    await git(root, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    return resources.save({ kind: "repo", name, localPath: root });
  }
  async function create(records, mode = "worktree", targetBranch = "") {
    const taskResources = [];
    for (const record of records) {
      const info = await service.inspectResource(record.id);
      taskResources.push({ resourceId: record.id, mode, sourceBranch: info.git.defaultSource, targetBranch });
    }
    return service.create({ requestId: randomUUID(), description: "删除回归任务", resources: taskResources, links: [], attachmentIds: [] }, 1);
  }
  return { directory, settings, service, repository, create };
}

async function remove(service, task, options) {
  const preview = await service.inspectDeletion(task.id, options, 1);
  assert.equal(preview.blocked, false, JSON.stringify(preview));
  await service.remove(task.id, { token: preview.token }, 1);
  return preview;
}

test("默认仅删除任务；当前分支模式即使请求清理也保留全部工作文件", async (context) => {
  const { service, repository, create } = await fixture(context);
  const repo = await repository("repo");
  const isolated = await create([repo]);
  await remove(service, isolated, keep);
  await access(isolated.resources[0].workingPath);
  assert.ok(await git(repo.localPath, "rev-parse", isolated.resources[0].targetBranch));
  const current = await create([repo], "current-branch");
  await writeFile(path.join(repo.localPath, "file.txt"), "unsaved");
  await writeFile(path.join(repo.localPath, "untracked.txt"), "keep");
  const preview = await remove(service, current, everything);
  assert.equal(preview.canDeleteWorktrees, false);
  assert.equal(preview.items[0].worktreeReason, "existing");
  assert.equal(await readFile(path.join(repo.localPath, "file.txt"), "utf8"), "unsaved");
  assert.equal(await git(repo.localPath, "branch", "--show-current"), "main");
  await access(path.join(repo.localPath, "untracked.txt"));
});

test("仅删除 Worktree 保留分支；多仓库清理不删除原仓库或远端引用", async (context) => {
  const { service, repository, create } = await fixture(context);
  const repo = await repository("first");
  const first = await create([repo]);
  await remove(service, first, worktreeOnly);
  await assert.rejects(access(first.resources[0].workingPath));
  assert.ok(await git(repo.localPath, "rev-parse", first.resources[0].targetBranch));
  const second = await create([repo, await repository("second")]);
  await remove(service, second, everything);
  for (const resource of second.resources) {
    await assert.rejects(access(resource.workingPath));
    await assert.rejects(git(resource.originalPath, "show-ref", "--verify", "refs/heads/" + resource.targetBranch));
    await access(resource.originalPath);
    assert.ok(await git(resource.originalPath, "rev-parse", "refs/remotes/origin/main"));
  }
});

test("未提交、未跟踪、忽略文件和未推送提交进入风险清单，确认后才清理", async (context) => {
  const { service, repository, create } = await fixture(context);
  const task = await create([await repository("repo")]);
  const root = task.resources[0].workingPath;
  await writeFile(path.join(root, "file.txt"), "committed change");
  await git(root, "add", "."); await git(root, "commit", "-m", "local only");
  await writeFile(path.join(root, "file.txt"), "uncommitted change");
  await writeFile(path.join(root, "new.txt"), "new");
  await writeFile(path.join(root, "ignored.txt"), "ignored");
  const preview = await service.inspectDeletion(task.id, everything, 1);
  assert.equal(preview.items[0].uncommittedFiles, 2);
  assert.equal(preview.items[0].ignoredFiles, 1);
  assert.equal(preview.items[0].unpushedCommits, 1);
  await access(root);
  await service.remove(task.id, { token: preview.token }, 1);
  await assert.rejects(access(root));
});

test("窗口绑定、选项变更、一次性令牌以及文件内容变化均阻止旧确认", async (context) => {
  const { service, repository, create } = await fixture(context);
  const task = await create([await repository("repo")]);
  const filename = path.join(task.resources[0].workingPath, "file.txt");
  await writeFile(filename, "first");
  let preview = await service.inspectDeletion(task.id, everything, 1);
  await assert.rejects(service.remove(task.id, { token: preview.token }, 2), /TASK_DELETE_CONFIRMATION/);
  await writeFile(filename, "other");
  await assert.rejects(service.remove(task.id, { token: preview.token }, 1), /TASK_DELETE_CHANGED/);
  await assert.rejects(service.remove(task.id, { token: preview.token }, 1), /TASK_DELETE_CONFIRMATION/);
  preview = await service.inspectDeletion(task.id, everything, 1);
  const replacement = await service.inspectDeletion(task.id, keep, 1);
  await assert.rejects(service.remove(task.id, { token: preview.token }, 1), /TASK_DELETE_CONFIRMATION/);
  assert.notEqual(preview.token, replacement.token);
  await access(filename);
  await assert.rejects(service.inspectDeletion(task.id, { deleteWorktrees: false, deleteBranches: true }, 1), /TASK_INVALID/);
});

test("共享 Worktree、锁定 Worktree、未知归属和受保护分支均保留", async (context) => {
  const { directory, settings, service, repository, create } = await fixture(context);
  const repo = await repository("repo");
  const task = await create([repo]);
  const resource = task.resources[0];
  const other = new TaskService(directory, "development", () => settings);
  await other.repository.create({ ...task, id: randomUUID(), title: "另一个任务", resources: [{ ...resource, mode: "current-branch", originalPath: resource.workingPath }] }, []);
  const shared = await service.inspectDeletion(task.id, everything, 1);
  assert.equal(shared.items[0].worktreeReason, "shared");
  assert.deepEqual(shared.items[0].sharedTasks, ["另一个任务"]);
  await service.remove(task.id, { token: shared.token }, 1);
  await access(resource.workingPath);
  const locked = await create([repo]);
  await git(repo.localPath, "worktree", "lock", locked.resources[0].workingPath);
  assert.equal((await remove(service, locked, everything)).items[0].worktreeReason, "locked");
  await access(locked.resources[0].workingPath);
  const protectedTask = await create([repo], "worktree", "development");
  const protectedPreview = await remove(service, protectedTask, everything);
  assert.equal(protectedPreview.items[0].branchReason, "protected");
  assert.ok(await git(repo.localPath, "rev-parse", "development"));
  const legacy = await create([repo]);
  const database = await openAppDatabase(path.join(directory, "app.db"));
  const old = { ...legacy.resources[0] }; delete old.ownership;
  database.prepare("UPDATE task_resources SET data=? WHERE namespace=? AND task_id=?").run(JSON.stringify(old), "production", legacy.id);
  database.close();
  assert.equal((await remove(service, legacy, everything)).canDeleteWorktrees, false);
  await access(old.workingPath);
});

test("目录被替换或变成符号链接时不删除指向的内容", async (context) => {
  const { directory, service, repository, create } = await fixture(context);
  const task = await create([await repository("repo")]);
  const root = task.resources[0].workingPath;
  const saved = path.join(directory, "moved");
  await rename(root, saved);
  await symlink(saved, root);
  const preview = await service.inspectDeletion(task.id, everything, 1);
  assert.equal(preview.items[0].worktreeAction, "keep");
  await assert.rejects(service.remove(task.id, { token: preview.token }, 1), /TASK_DELETE_INSPECTION/);
  await access(path.join(saved, "file.txt"));
  await remove(service, task, keep);
  await access(path.join(saved, "file.txt"));
});

test("部分清理失败保留任务和已完成记录，重启后明确确认才继续", async (context) => {
  const { directory, settings, service, repository, create } = await fixture(context);
  const task = await create([await repository("repo")]);
  const record = service.repository.recordDeletion.bind(service.repository);
  service.repository.recordDeletion = async (id, progress) => {
    if (progress.branch === "pending") throw new Error("simulated disk failure");
    return record(id, progress);
  };
  const preview = await service.inspectDeletion(task.id, everything, 1);
  await assert.rejects(service.remove(task.id, { token: preview.token }, 1), /TASK_DELETE_FAILED/);
  await assert.rejects(access(task.resources[0].workingPath));
  const restarted = new TaskService(directory, "production", () => settings);
  assert.equal((await restarted.load()).tasks.length, 1);
  const resumed = await restarted.inspectDeletion(task.id, everything, 1);
  assert.equal(resumed.items[0].worktreeAction, "removed");
  assert.equal(resumed.items[0].branchAction, "delete");
  await restarted.remove(task.id, { token: resumed.token }, 1);
  assert.deepEqual((await restarted.load()).tasks, []);
});

test("工作区删除后远端引用变化，停止分支清理并要求再次确认", async (context) => {
  const { service, repository, create } = await fixture(context);
  const repo = await repository("repo");
  const task = await create([repo]);
  const record = service.repository.recordDeletion.bind(service.repository);
  let changed = false;
  service.repository.recordDeletion = async (id, progress) => {
    await record(id, progress);
    if (progress.worktree === "removed" && !changed) {
      changed = true;
      await git(repo.localPath, "update-ref", "-d", "refs/remotes/origin/HEAD");
      await git(repo.localPath, "update-ref", "-d", "refs/remotes/origin/main");
    }
  };
  const preview = await service.inspectDeletion(task.id, everything, 1);
  await assert.rejects(service.remove(task.id, { token: preview.token }, 1), /TASK_DELETE_CHANGED/);
  assert.ok(await git(repo.localPath, "rev-parse", task.resources[0].targetBranch));
  assert.equal((await service.load()).tasks.length, 1);
  const refreshed = await service.inspectDeletion(task.id, everything, 1);
  assert.equal(refreshed.items[0].unpushedCommits, null);
  await service.remove(task.id, { token: refreshed.token }, 1);
});

test("分支被另一工作区使用时只清理本任务 Worktree", async (context) => {
  const { directory, service, repository, create } = await fixture(context);
  const repo = await repository("repo");
  const task = await create([repo]);
  const sibling = path.join(directory, "other-checkout");
  await git(repo.localPath, "worktree", "add", "--force", sibling, task.resources[0].targetBranch);
  const preview = await remove(service, task, everything);
  assert.equal(preview.items[0].branchReason, "inUse");
  await access(sibling);
  assert.ok(await git(repo.localPath, "rev-parse", task.resources[0].targetBranch));
});

test("新的修改出现在确认与执行之间时不会被 force 删除", async (context) => {
  const { service, repository, create } = await fixture(context);
  const task = await create([await repository("repo")]);
  const record = service.repository.recordDeletion.bind(service.repository);
  service.repository.recordDeletion = async (id, progress) => {
    await record(id, progress);
    if (progress.worktree === "pending") await writeFile(path.join(task.resources[0].workingPath, "new-after-confirmation.txt"), "keep me");
  };
  const preview = await service.inspectDeletion(task.id, everything, 1);
  await assert.rejects(service.remove(task.id, { token: preview.token }, 1), /TASK_DELETE_CHANGED/);
  await access(path.join(task.resources[0].workingPath, "new-after-confirmation.txt"));
});

test("Detached HEAD 有明确警告；无远端引用不宣称已推送", async (context) => {
  const { service, repository, create } = await fixture(context);
  const repo = await repository("repo");
  const task = await create([repo]);
  await git(task.resources[0].workingPath, "switch", "--detach");
  await git(repo.localPath, "update-ref", "-d", "refs/remotes/origin/HEAD");
  await git(repo.localPath, "update-ref", "-d", "refs/remotes/origin/main");
  const preview = await service.inspectDeletion(task.id, everything, 1);
  assert.equal(preview.items[0].detached, true);
  assert.equal(preview.items[0].unpushedCommits, null);
  await service.remove(task.id, { token: preview.token }, 1);
});
