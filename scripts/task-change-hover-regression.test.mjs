import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { ChangeGitStatusService } = load("src/main-process/services/changeGitStatusService.ts");
const { isSameTrackingRef, CHANGE_GIT_FILE_CAP } = load("src/shared/changeGitStatus.ts");

const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0",
  LC_ALL: "C",
};

function git(cwd, args, extraEnv = {}) {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...gitEnv, ...extraEnv } }).trim();
}

function gitAllow(cwd, args, extraEnv = {}) {
  try { return git(cwd, args, extraEnv); }
  catch (error) { return (error.stdout || "").toString().trim(); }
}

function resource(directory, fields = {}) {
  return {
    resourceId: "repo",
    name: "navo",
    mode: "worktree",
    sourceBranch: "main",
    targetBranch: "feature",
    workingPath: directory,
    originalPath: directory,
    ...fields,
  };
}

function serviceFor(item) {
  const task = { id: "task", resources: [item] };
  return new ChangeGitStatusService(async () => [task]);
}

async function initRepo(root, branch = "main") {
  const repo = path.join(root, "repo");
  await mkdir(repo);
  git(repo, ["init", "-b", branch]);
  git(repo, ["config", "user.name", "Fixture"]);
  git(repo, ["config", "user.email", "fixture@example.invalid"]);
  git(repo, ["config", "commit.gpgsign", "false"]);
  await writeFile(path.join(repo, "base.txt"), "base\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "Base"]);
  return repo;
}

test("main 与 origin/main 视为同一条跟踪关系", () => {
  assert.equal(isSameTrackingRef("main", "origin/main"), true);
  assert.equal(isSameTrackingRef("refs/heads/main", "refs/remotes/origin/main"), true);
  assert.equal(isSameTrackingRef("release/1.0", "origin/release/1.0"), true);
  assert.equal(isSameTrackingRef("main", "origin/develop"), false);
  assert.equal(isSameTrackingRef("feature", "origin/main"), false);
  assert.equal(CHANGE_GIT_FILE_CAP, 2000);
});

test("CHANGES 悬停卡读取已绑定工作区，不接收渲染进程路径", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-change-hover-"));
  try {
    const repo = await initRepo(root);
    const worktree = path.join(root, "worktree");
    git(repo, ["worktree", "add", "-b", "feature", worktree]);
    await writeFile(path.join(worktree, "feature.txt"), "feature\n");
    git(worktree, ["add", "."]);
    git(worktree, ["commit", "-m", "Feature"]);
    await writeFile(path.join(worktree, "base.txt"), "base\nedit\n");
    await writeFile(path.join(worktree, "loose.txt"), "untracked\n");
    const item = resource(worktree, { originalPath: repo, mode: "worktree" });
    const service = serviceFor(item);
    const status = await service.inspect("task", "repo");
    assert.equal(status.branchName, "feature");
    assert.equal(status.repoName, "navo");
    assert.equal(status.workingPath, worktree);
    assert.equal(status.isDetached, false);
    assert.equal(status.failed, false);
    assert.equal(status.missingDirectory, false);
    assert.equal(status.isMainWorktree, false);
    assert.equal(status.upstream, null);
    assert.equal(status.sinceSource.branch, "main");
    assert.equal(status.sinceSource.commits, 1);
    assert.equal(status.sinceSource.files, 1);
    assert.ok(status.sinceSource.additions >= 1);
    assert.equal(status.uncommitted.files, 1);
    assert.ok(status.uncommitted.additions >= 1);
    assert.equal(status.untrackedCount, 1);
    assert.equal(status.sourceBehind.kind, "even");
    const main = await serviceFor(resource(repo, { resourceId: "repo", mode: "current-branch", targetBranch: "main", sourceBranch: "main" })).inspect("task", "repo");
    assert.equal(main.isMainWorktree, true);
    assert.equal(main.branchName, "main");
    await assert.rejects(service.inspect("wrong", "repo"), /RESOURCE_NOT_FOUND/);
    await assert.rejects(service.inspect("task", "unknown"), /RESOURCE_NOT_FOUND/);
    await assert.rejects(service.inspect("", "repo"), /TASK_INVALID/);
    item.mode = "folder";
    await assert.rejects(service.inspect("task", "repo"), /RESOURCE_NOT_FOUND/);
    assert.equal(service.inspect.length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("上游领先落后只用本地跟踪引用，不为悬停 fetch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-change-hover-up-"));
  try {
    const repo = await initRepo(root);
    git(repo, ["checkout", "-b", "feature"]);
    await writeFile(path.join(repo, "feature.txt"), "one\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "Ahead"]);
    git(repo, ["checkout", "main"]);
    await writeFile(path.join(repo, "main.txt"), "behind\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "Main ahead"]);
    git(repo, ["checkout", "feature"]);
    git(repo, ["remote", "add", "origin", "https://127.0.0.1:1/invalid-navo.git"]);
    git(repo, ["update-ref", "refs/remotes/origin/main", "main"]);
    git(repo, ["config", "branch.feature.remote", "origin"]);
    git(repo, ["config", "branch.feature.merge", "refs/heads/main"]);
    const same = await serviceFor(resource(repo, { mode: "current-branch" })).inspect("task", "repo");
    assert.equal(same.upstream.name, "origin/main");
    assert.equal(same.upstream.ahead, 1);
    assert.equal(same.upstream.behind, 1);
    assert.equal(same.sourceBehind.kind, "omitted");
    git(repo, ["update-ref", "refs/remotes/origin/feature", "HEAD"]);
    git(repo, ["config", "branch.feature.merge", "refs/heads/feature"]);
    const different = await serviceFor(resource(repo, { mode: "current-branch" })).inspect("task", "repo");
    assert.equal(different.upstream.name, "origin/feature");
    assert.equal(different.upstream.ahead, 0);
    assert.equal(different.upstream.behind, 0);
    assert.equal(different.sourceBehind.kind, "behind");
    assert.equal(different.sourceBehind.branch, "main");
    assert.equal(different.sourceBehind.count, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("分离 HEAD、缺失目录、非仓库失败与尚未发布", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-change-hover-edge-"));
  try {
    const repo = await initRepo(root);
    const sha = git(repo, ["rev-parse", "--short", "HEAD"]);
    git(repo, ["checkout", "--detach", "HEAD"]);
    const detached = await serviceFor(resource(repo, { mode: "current-branch", targetBranch: "main", sourceBranch: "main" })).inspect("task", "repo");
    assert.equal(detached.isDetached, true);
    assert.equal(detached.branchName, sha);
    assert.equal(detached.upstream, null);
    git(repo, ["checkout", "main"]);
    const unpublished = await serviceFor(resource(repo, { mode: "current-branch", targetBranch: "main", sourceBranch: "main" })).inspect("task", "repo");
    assert.equal(unpublished.upstream, null);
    const missing = await serviceFor(resource(path.join(root, "missing"), { mode: "current-branch" })).inspect("task", "repo");
    assert.equal(missing.missingDirectory, true);
    assert.equal(missing.failed, false);
    const plain = path.join(root, "plain");
    await mkdir(plain);
    const failed = await serviceFor(resource(plain, { mode: "current-branch" })).inspect("task", "repo");
    assert.equal(failed.failed, true);
    assert.equal(failed.missingDirectory, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("变基/合并暂停：无冲突只写操作名，有冲突才带个数", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-change-hover-op-"));
  try {
    const repo = await initRepo(root);
    await writeFile(path.join(repo, "base.txt"), "feature\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "Feature change"]);
    const editor = "python3 -c \"import pathlib,sys; p=pathlib.Path(sys.argv[1]); p.write_text(p.read_text().replace('pick', 'edit', 1))\"";
    gitAllow(repo, ["rebase", "-i", "HEAD~1"], { GIT_SEQUENCE_EDITOR: editor, GIT_EDITOR: "true" });
    const rebase = await serviceFor(resource(repo, { mode: "current-branch", targetBranch: "main", sourceBranch: "main" })).inspect("task", "repo");
    assert.equal(rebase.operation.kind, "rebase");
    assert.equal(rebase.operation.conflicts, 0);
    gitAllow(repo, ["rebase", "--abort"]);
    git(repo, ["checkout", "-b", "other"]);
    await writeFile(path.join(repo, "base.txt"), "other\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "Other"]);
    git(repo, ["checkout", "main"]);
    await writeFile(path.join(repo, "base.txt"), "main-side\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "Main side"]);
    gitAllow(repo, ["merge", "other"]);
    const merged = await serviceFor(resource(repo, { mode: "current-branch", targetBranch: "main", sourceBranch: "main" })).inspect("task", "repo");
    assert.equal(merged.operation.kind, "merge");
    assert.ok(merged.operation.conflicts >= 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("超过 100 个提交时给出准确总数，达到 2000 个未提交文件则不再精确计数", { timeout: 60000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-change-hover-cap-"));
  try {
    const repo = await initRepo(root);
    git(repo, ["checkout", "-b", "feature"]);
    for (let index = 1; index <= 101; index += 1) git(repo, ["commit", "--allow-empty", "-m", "Commit " + index]);
    const counted = await serviceFor(resource(repo, { mode: "current-branch" })).inspect("task", "repo");
    assert.equal(counted.sinceSource.commits, 101);
    const dirty = path.join(root, "dirty");
    git(repo, ["worktree", "add", "--detach", dirty]);
    for (let index = 0; index < CHANGE_GIT_FILE_CAP; index += 1) await writeFile(path.join(dirty, "u" + index + ".txt"), "x");
    const overflow = await serviceFor(resource(dirty, { mode: "current-branch", targetBranch: "", sourceBranch: "main" })).inspect("task", "repo");
    assert.equal(overflow.uncommitted, "uncounted");
    assert.equal(overflow.untrackedCount, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("读取失败保留上次成功结果，目录不存在仍更新缓存", async () => {
  const snapshot = (patch = {}) => ({
    branchName: "feature", repoName: "navo", workingPath: "/fixture/repo",
    isDetached: false, missingDirectory: false, failed: false, operation: null,
    sinceSource: { branch: "main", commits: 2, files: 3, additions: 4, deletions: 1 },
    uncommitted: { files: 2, additions: 5, deletions: 2 }, untrackedCount: 1,
    upstream: { name: "origin/feature", ahead: 1, behind: 0 },
    sourceBehind: { kind: "omitted" }, isMainWorktree: true, ...patch,
  });
  let next;
  const { loadChangeGitStatus, getCachedChangeGitStatus, clearChangeGitStatusCache } = createLoader({
    "./taskApi": { getTasksApi: () => ({ inspectChangeGitStatus: async () => structuredClone(next) }) },
  })("src/services/changeGitStatusCache.ts");

  next = snapshot({ failed: true, sinceSource: null, uncommitted: { files: 0, additions: 0, deletions: 0 }, untrackedCount: 0, upstream: null });
  const empty = await loadChangeGitStatus("task", "repo", "/fixture/repo", true);
  assert.equal(empty.failed, true);
  assert.equal(getCachedChangeGitStatus("task", "repo", "/fixture/repo").failed, true);

  clearChangeGitStatusCache();
  next = snapshot();
  const success = await loadChangeGitStatus("task", "repo", "/fixture/repo", true);
  assert.equal(success.failed, false);
  assert.equal(success.sinceSource.commits, 2);
  next = snapshot({ failed: true, sinceSource: null, uncommitted: { files: 0, additions: 0, deletions: 0 }, untrackedCount: 0, upstream: null });
  const kept = await loadChangeGitStatus("task", "repo", "/fixture/repo", true);
  assert.equal(kept.failed, false);
  assert.equal(kept.sinceSource.commits, 2);
  assert.equal(getCachedChangeGitStatus("task", "repo", "/fixture/repo").failed, false);
  assert.equal(getCachedChangeGitStatus("task", "repo", "/fixture/repo").sinceSource.commits, 2);

  next = snapshot({ missingDirectory: true, failed: false, sinceSource: null, uncommitted: { files: 0, additions: 0, deletions: 0 }, untrackedCount: 0, upstream: null, isMainWorktree: false });
  const missing = await loadChangeGitStatus("task", "repo", "/fixture/repo", true);
  assert.equal(missing.missingDirectory, true);
  assert.equal(missing.failed, false);
  assert.equal(getCachedChangeGitStatus("task", "repo", "/fixture/repo").missingDirectory, true);
});
