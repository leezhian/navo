import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

const { TaskBranchService } = createLoader()("src/main-process/services/taskBranchService.ts");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" } }).trim();

test("分支栏读取实际 worktree、分支提交与暂存/未暂存统计，不改仓库", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-branch-"));
  try {
    const repo = path.join(root, "repo"), worktree = path.join(root, "worktree");await mkdir(repo);
    git(repo, "init", "-b", "main");await writeFile(path.join(repo, "base.txt"), "base\n");git(repo, "add", ".");git(repo, "commit", "-m", "Base");
    git(repo, "worktree", "add", "-b", "feature", worktree);
    await writeFile(path.join(worktree, "feature.txt"), "feature\n");git(worktree, "add", ".");git(worktree, "commit", "-m", "Feature commit");
    const special = "space\tand\nnewline.txt";
    await writeFile(path.join(worktree, special), "first\n");git(worktree, "add", "--", special);
    await writeFile(path.join(worktree, "base.txt"), "base\nnew\n");
    await writeFile(path.join(worktree, "ignored.tmp"), "untracked\n");
    const task = { id: "task", resources: [{ resourceId: "repo", mode: "worktree", workingPath: worktree, sourceBranch: "main", targetBranch: "outdated-name" }] };
    const service = new TaskBranchService(async () => [task]);
    const before = git(worktree, "status", "--porcelain=v1", "-z");
    const snapshot = await service.load("task", "repo");
    assert.equal(snapshot.branchName, "feature");assert.equal(snapshot.baseAvailable, true);
    assert.equal(snapshot.untrackedCount, 1);assert.equal(snapshot.commits[0].title, "Feature commit");
    assert.equal(snapshot.commits.length, 1);assert.equal(snapshot.commits[0].sha, git(worktree, "rev-parse", "HEAD"));
    assert.equal(snapshot.files.unstaged[0].path, "base.txt");assert.equal(snapshot.files.unstaged[0].additions, 1);
    assert.equal(snapshot.files.staged[0].path, special);assert.equal(snapshot.files.staged[0].status, "A");
    assert.equal(snapshot.files.branch[0].path, "feature.txt");
    assert.equal(git(worktree, "status", "--porcelain=v1", "-z"), before);
    task.resources[0].sourceBranch = "missing";
    const missing = await service.load("task", "repo");assert.equal(missing.baseAvailable, false);assert.equal(missing.files.unstaged.length, 1);assert.deepEqual(missing.commits, []);
    await assert.rejects(service.load("wrong-task", "repo"), /RESOURCE_NOT_FOUND/);
    await assert.rejects(service.load("task", "unknown"), /RESOURCE_NOT_FOUND/);
    task.resources[0].mode = "folder";await assert.rejects(service.load("task", "repo"), /RESOURCE_NOT_FOUND/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("无初始提交的仓库仍能展示暂存文件，不虚构提交；二进制统计不产生 NaN", async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), "navo-branch-empty-"));
  try {
    git(repo, "init", "-b", "main");await writeFile(path.join(repo, "binary.bin"), Buffer.from([0, 1, 2, 0]));git(repo, "add", ".");
    const service = new TaskBranchService(async () => [{ id: "task", resources: [{ resourceId: "repo", mode: "current-branch", workingPath: repo, sourceBranch: "main" }] }]);
    const snapshot = await service.load("task", "repo");
    assert.equal(snapshot.branchName, "main");assert.equal(snapshot.baseAvailable, false);assert.deepEqual(snapshot.commits, []);
    assert.equal(snapshot.files.staged[0].binary, true);assert.equal(snapshot.files.staged[0].additions, 0);
  } finally { await rm(repo, { recursive: true, force: true }); }
});
