import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, realpath, access, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader({ electron: { nativeImage: { createFromPath: () => ({ isEmpty: () => true }) } } });
const { TaskService } = load("src/main-process/services/taskService.ts");
const { ResourceService } = load("src/main-process/services/resourceService.ts");
const { TaskResourceRepository } = load("src/main-process/services/taskResourceRepository.ts");
const { defaultSettings } = load("src/domain/settings.ts");
const { prepareWorkspace, createWorkspace, createWorkspaceDirectory } = load("src/main-process/services/taskWorkspaces.ts");
const execute = promisify(execFile);
async function git(cwd, ...args) {
  return (await execute("git", args, { cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: os.devNull } })).stdout.trim();
}
const payload = (resources) => ({ requestId: randomUUID(), resources, links: [], webLinks: [], notes: [], fileIds: [] });

async function fixture(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-workspace-bindings-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const settings = { ...defaultSettings, worktreesDirectory: path.join(directory, "worktrees"), branchPrefix: "navo/" };
  const service = new TaskService(directory, "production", () => settings);
  const registry = new ResourceService(path.join(directory, "resources.json"));
  const task = await service.create({ requestId: randomUUID(), description: "Existing task\nKeep instructions", resources: [], links: [], attachmentIds: [] }, 1);
  async function resource(name, repository = true) {
    const localPath = path.join(directory, name);await mkdir(localPath);
    if (repository) {
      await git(localPath, "init", "-b", "main");
      await git(localPath, "config", "user.name", "Navo tests");await git(localPath, "config", "user.email", "test@example.invalid");
      await git(localPath, "config", "core.hooksPath", os.devNull);
      await writeFile(path.join(localPath, "readme.txt"), "initial\n");
      await git(localPath, "add", "readme.txt");await git(localPath, "commit", "-m", "initial");
    }
    return registry.save({ kind: "folder", name, localPath });
  }
  async function input(record, mode = "worktree") {
    const info = await service.inspectResource(record.id);
    return { resourceId: record.id, mode: info.git ? mode : "folder", sourceBranch: info.git?.defaultSource ?? "", targetBranch: "" };
  }
  return { directory, settings, service, registry, task, resource, input };
}

test("已有任务追加真实 Worktree，原子保存、并发重试幂等及重启恢复", async (context) => {
  const { directory, settings, service, task, resource, input } = await fixture(context);
  const repo = await resource("repo");const request = payload([await input(repo)]);
  const [updated, repeated] = await Promise.all([service.addResources(task.id, request, 1), service.addResources(task.id, request, 1)]);
  assert.deepEqual(repeated, updated);
  assert.ok(Date.parse(updated.updatedAt) > Date.parse(task.updatedAt));
  assert.deepEqual((await service.repository.load()).find((item) => item.id === task.id), updated);
  assert.equal(updated.title, task.title);assert.equal(updated.description, task.description);assert.equal(updated.date, task.date);assert.equal(updated.status, task.status);
  assert.equal(updated.projectName, repo.name);assert.equal(updated.resources.length, 1);
  const workspace = updated.resources[0];
  assert.match(workspace.targetBranch, /^navo\/[a-f0-9]{8}$/);
  assert.equal(await git(workspace.workingPath, "branch", "--show-current"), workspace.targetBranch);
  assert.equal(await git(repo.localPath, "branch", "--show-current"), "main");
  assert.ok(workspace.ownership);assert.equal((await service.repository.deletionContext(task.id)).owned.length, 1);
  assert.deepEqual(await service.repository.operations(), []);
  const restarted = new TaskService(directory, "production", () => settings);
  assert.deepEqual((await restarted.load()).tasks.find((item) => item.id === task.id).resources, updated.resources);
  assert.equal((await restarted.addResources(task.id, request, 1)).resources.length, 1);
  const preview = await restarted.inspectDeletion(task.id, { deleteWorktrees: true, deleteBranches: true }, 1);
  assert.equal(preview.items[0].worktreeAction, "delete");
  await restarted.remove(task.id, { token: preview.token }, 1);
  await assert.rejects(access(workspace.workingPath));await access(repo.localPath);
});

test("追加当前分支、原仓库新分支和普通文件夹，保留原关联及任务内容", async (context) => {
  const { service, task, resource, input } = await fixture(context);
  const current = await resource("current");const branch = await resource("branch");const folder = await resource("assets", false);
  await writeFile(path.join(current.localPath, "uncommitted.txt"), "keep");
  const first = await service.addResources(task.id, payload([await input(current, "current-branch")]), 1);
  const updated = await service.addResources(task.id, payload([await input(branch, "new-branch"), await input(folder)]), 1);
  assert.deepEqual(updated.resources[0], first.resources[0]);assert.equal(updated.projectName, current.name);
  assert.equal(updated.resources[0].workingPath, current.localPath);assert.equal(updated.resources[0].targetBranch, "main");
  assert.equal(await readFile(path.join(current.localPath, "uncommitted.txt"), "utf8"), "keep");
  assert.equal(await git(branch.localPath, "branch", "--show-current"), updated.resources[1].targetBranch);
  assert.equal(updated.resources[2].mode, "folder");assert.equal(updated.resources[2].workingPath, folder.localPath);
});

test("重复原目录和别名去重，非法输入、脏仓库及归档任务在产生副作用前拒绝", async (context) => {
  const { service, task, registry, resource, input } = await fixture(context);
  const repo = await resource("repo");const added = await input(repo, "current-branch");
  await service.addResources(task.id, payload([added]), 1);
  assert.equal((await service.addResources(task.id, payload([added]), 1)).resources.length, 1);
  const subdirectory = path.join(repo.localPath, "sub");await mkdir(subdirectory);
  const alias = await registry.save({ kind: "folder", name: "alias", localPath: subdirectory });
  assert.equal((await service.addResources(task.id, payload([await input(alias, "current-branch")]), 1)).resources.length, 1);
  await assert.rejects(service.addResources(task.id, payload([]), 1), /TASK_INVALID/);
  await assert.rejects(service.addResources(task.id, { ...payload([added]), notes: [{ id: randomUUID(), title: "mixed", content: "not allowed" }] }, 1), /TASK_INVALID/);
  await assert.rejects(service.addResources(task.id, payload([{ ...added, resourceId: "unknown" }]), 1), /RESOURCE_NOT_FOUND/);
  const dirty = await resource("dirty");await writeFile(path.join(dirty.localPath, "readme.txt"), "modified");
  await assert.rejects(service.addResources(task.id, payload([await input(dirty, "new-branch")]), 1), /TASK_DIRTY_REPOSITORY/);
  assert.equal(await git(dirty.localPath, "branch", "--show-current"), "main");
  await service.move(task.id, "ARCHIVED", null);
  await assert.rejects(service.addResources(task.id, payload([await input(dirty)]), 1), /TASK_BUSY/);
  assert.equal((await service.repository.load())[0].resources.length, 1);
  assert.deepEqual(await service.repository.operations(), []);
});

test("保存失败回滚本次 Worktree；出现用户修改时保留现场，不修改既有任务", async (context) => {
  const { service, task, resource, input } = await fixture(context);
  const repo = await resource("repo");const request = payload([await input(repo)]);
  const append = TaskResourceRepository.prototype.appendWorkspaces;
  let created;
  try {
    TaskResourceRepository.prototype.appendWorkspaces = async (_taskId, _requestId, resources) => { created = resources[0];throw Error("DB_FAILED"); };
    await assert.rejects(service.addResources(task.id, request, 1), /DB_FAILED/);
    await assert.rejects(access(created.workingPath));
    assert.equal(await git(repo.localPath, "branch", "--format=%(refname:short)"), "main");
    assert.deepEqual(await service.repository.operations(), []);
    TaskResourceRepository.prototype.appendWorkspaces = async (_taskId, _requestId, resources) => { created = resources[0];await writeFile(path.join(created.workingPath, "user.txt"), "preserve");throw Error("DB_FAILED"); };
    await assert.rejects(service.addResources(task.id, request, 1), /TASK_CREATE_RETAINED/);
    assert.equal(await readFile(path.join(created.workingPath, "user.txt"), "utf8"), "preserve");
    assert.equal((await service.repository.operations())[0].state, "retained");
    assert.equal((await service.repository.load())[0].resources.length, 0);
    await assert.rejects(service.addResources(task.id, request, 1), /TASK_CREATE_RETAINED/);
  } finally { TaskResourceRepository.prototype.appendWorkspaces = append; }
});

test("重启回滚未完成的追加操作，不碰任务原有 Worktree", async (context) => {
  const { directory, settings, service, task, resource, input } = await fixture(context);
  const original = await resource("original");const next = await resource("next");
  const existing = await service.addResources(task.id, payload([await input(original)]), 1);
  const request = payload([await input(next)]);
  const manifest = { workspaceDirectory: path.join(settings.worktreesDirectory, task.id, request.requestId), workspaceDirectoryOwned: false, attachmentDirectory: "", attachmentDirectoryOwned: false, steps: [] };
  manifest.steps.push(await prepareWorkspace(await service.inspectResource(next.id), request.resources[0], settings.branchPrefix, manifest.workspaceDirectory, 2));
  const persist = () => service.repository.recordOperation(request.requestId, "pending", manifest);
  await persist();await createWorkspaceDirectory(manifest, persist);await createWorkspace(manifest.steps[0], persist);
  const restarted = new TaskService(directory, "production", () => settings);
  const result = await restarted.load();
  assert.equal(result.recoveryWarnings.length, 0);assert.deepEqual(result.tasks[0].resources, existing.resources);
  await access(existing.resources[0].workingPath);await assert.rejects(access(manifest.steps[0].resource.workingPath));
});

test("同一 Repo 可追加多个独立 Worktree，复用同一个工作区时去重且会话绑定稳定", async (context) => {
  const { service, settings, task, resource, input } = await fixture(context);
  const repo = await resource("repo");
  const first = await service.addResources(task.id, payload([await input(repo)]), 1);
  const second = await service.addResources(task.id, payload([await input(repo)]), 1);
  assert.equal(second.resources.length, 2);
  assert.equal(new Set(second.resources.map(item => item.resourceId)).size, 2);
  assert.equal(new Set(second.resources.map(item => item.workingPath)).size, 2);
  assert.equal(new Set(second.resources.map(item => item.targetBranch)).size, 2);
  assert.ok(second.resources.every(item => item.repositoryId === repo.id));
  assert.deepEqual(second.resources[0], first.resources[0]);
  const reuse = { ...await input(repo), sourceBranch: "refs/heads/" + first.resources[0].targetBranch, useExistingBranch: true };
  const repeated = await service.addResources(task.id, payload([reuse]), 1);
  assert.deepEqual(repeated.resources, second.resources);
  const { prepareTaskContext } = load("src/main-process/services/taskSessions/taskContext.ts");
  const { TaskBranchService } = load("src/main-process/services/taskBranchService.ts");
  const branches = new TaskBranchService(() => service.repository.load());
  for (const workspace of repeated.resources) {
    assert.equal((await prepareTaskContext(repeated, settings.tasksDirectory, workspace.resourceId)).cwd, await realpath(workspace.workingPath));
    assert.equal((await branches.load(task.id, workspace.resourceId)).branchName, workspace.targetBranch);
  }
  const preview = await service.inspectDeletion(task.id, { deleteWorktrees: true, deleteBranches: true }, 1);
  assert.equal(new Set(preview.items.map(item => item.resourceId)).size, 2);
  assert.ok(preview.items.every(item => item.worktreeAction === "delete" && item.branchAction === "delete"));
  await service.remove(task.id, { token: preview.token }, 1);
  for (const workspace of repeated.resources) await assert.rejects(access(workspace.workingPath));
});

test("创建阶段同仓库多份隔离目录也拥有独立标识，不按 Repo 去重", async (context) => {
  const { service, resource, input } = await fixture(context);
  const repo = await resource("repo");const configuration = await input(repo);
  const created = await service.create({ requestId: randomUUID(), description: "Parallel work", resources: [configuration, configuration], links: [], attachmentIds: [] }, 1);
  assert.equal(created.resources.length, 2);
  assert.notEqual(created.resources[0].resourceId, created.resources[1].resourceId);
  assert.notEqual(created.resources[0].targetBranch, created.resources[1].targetBranch);
});

test("已有分支创建 Worktree 不认领分支；复用外部 Worktree 不认领目录", async (context) => {
  const { directory, service, task, resource, input } = await fixture(context);
  const repo = await resource("repo");await git(repo.localPath, "branch", "review-existing");
  const request = payload([{ ...await input(repo), useExistingBranch: true, sourceBranch: "refs/heads/review-existing" }]);
  const created = await service.addResources(task.id, request, 1);
  assert.equal(created.resources[0].targetBranch, "review-existing");
  assert.equal(created.resources[0].ownership.branchCreated, false);
  const externalPath = path.join(directory, "external");
  await git(repo.localPath, "worktree", "add", "-b", "external-branch", externalPath);
  await writeFile(path.join(externalPath, "user.txt"), "must survive");
  const externalInput = { ...await input(repo), useExistingBranch: true, sourceBranch: "refs/heads/external-branch" };
  const updated = await service.addResources(task.id, payload([externalInput]), 1);
  assert.equal(updated.resources.length, 2);assert.equal(updated.resources[1].workingPath, await realpath(externalPath));
  assert.equal(updated.resources[1].ownership, undefined);
  assert.equal((await service.addResources(task.id, payload([externalInput]), 1)).resources.length, 2);
  const preview = await service.inspectDeletion(task.id, { deleteWorktrees: true, deleteBranches: true }, 1);
  assert.equal(preview.items[0].worktreeAction, "delete");assert.equal(preview.items[0].branchAction, "keep");
  assert.equal(preview.items[0].branchReason, "existing");assert.equal(preview.items[1].worktreeAction, "keep");
  await service.remove(task.id, { token: preview.token }, 1);
  assert.equal(await readFile(path.join(externalPath, "user.txt"), "utf8"), "must survive");
  await git(repo.localPath, "rev-parse", "--verify", "refs/heads/review-existing");
});

test("复用分支失败回滚时保留原有分支和外部目录", async (context) => {
  const { service, task, resource, input } = await fixture(context);
  const repo = await resource("repo");await git(repo.localPath, "branch", "existing");
  const append = TaskResourceRepository.prototype.appendWorkspaces;
  let workingPath;
  try {
    TaskResourceRepository.prototype.appendWorkspaces = async (_taskId, _requestId, resources) => { workingPath = resources[0].workingPath;throw Error("DB_FAILED"); };
    await assert.rejects(service.addResources(task.id, payload([{ ...await input(repo), useExistingBranch: true, sourceBranch: "refs/heads/existing" }]), 1), /DB_FAILED/);
    await assert.rejects(access(workingPath));await git(repo.localPath, "rev-parse", "--verify", "refs/heads/existing");
    await assert.rejects(service.addResources(task.id, payload([{ ...await input(repo, "new-branch"), useExistingBranch: true, sourceBranch: "refs/heads/existing" }]), 1), /DB_FAILED/);
    assert.equal(await git(repo.localPath, "branch", "--show-current"), "main");
    await git(repo.localPath, "rev-parse", "--verify", "refs/heads/existing");
    assert.deepEqual(await service.repository.operations(), []);
  } finally { TaskResourceRepository.prototype.appendWorkspaces = append; }
});

test("远程跟踪分支可使用本地引用准备工作区，再次选择时复用而不联网", async (context) => {
  const { service, task, resource, input } = await fixture(context);
  const repo = await resource("repo");
  await git(repo.localPath, "remote", "add", "origin", "https://example.invalid/not-used.git");
  await git(repo.localPath, "update-ref", "refs/remotes/origin/review", "HEAD");
  const configuration = { ...await input(repo), useExistingBranch: true, sourceBranch: "refs/remotes/origin/review" };
  const created = await service.addResources(task.id, payload([configuration, configuration]), 1);
  assert.equal(created.resources.length, 1);
  assert.equal(created.resources[0].targetBranch, "review");
  const repeated = await service.addResources(task.id, payload([configuration]), 1);
  assert.deepEqual(repeated.resources, created.resources);
});
