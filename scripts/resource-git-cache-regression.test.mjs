import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";

const execute = promisify(execFile);

async function fixture(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-git-cache-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const repo = path.join(directory, "repo");
  await execute("git", ["init", "--quiet", repo]);
  const calls = [];
  let fail = false;
  const trackedExecute = Object.assign(() => {}, { [promisify.custom]: async (command, args, options) => {
    calls.push(args);
    if (fail) throw new Error("Git failed");
    return execute(command, args, options);
  } });
  const { inspectResourceGit } = createLoader({ "node:child_process": { execFile: trackedExecute } })("src/main-process/services/resourceGitInfo.ts");
  const git = (...args) => execute("git", ["-C", repo, ...args]);
  return { directory, repo, git, calls, inspectResourceGit, setFail: (value) => { fail = value; } };
}

test("主进程复用远程缓存、合并并发；配置变化及手动刷新才再次执行 Git", async (context) => {
  const { repo, git, calls, inspectResourceGit, setFail } = await fixture(context);
  await git("remote", "add", "origin", "https://example.com/team/first.git");
  const results = await Promise.all([inspectResourceGit(repo), inspectResourceGit(repo), inspectResourceGit(repo)]);
  assert.ok(results.every((info) => info.remoteUrl === "https://example.com/team/first.git"));
  assert.equal(calls.filter((args) => args[0] === "remote" && args[1] === "get-url").length, 1);
  const firstCount = calls.length;
  await inspectResourceGit(repo);
  assert.equal(calls.length, firstCount, "缓存命中不能再次启动 Git 进程");
  await writeFile(path.join(repo, "unrelated.txt"), "working tree change");
  await inspectResourceGit(repo);
  assert.equal(calls.length, firstCount, "普通工作区文件修改不应使远程配置缓存失效");
  await git("remote", "set-url", "origin", "https://example.com/team/second.git");
  assert.equal((await inspectResourceGit(repo)).remoteUrl, "https://example.com/team/second.git");
  assert.ok(calls.length > firstCount);
  const changedCount = calls.length;
  await inspectResourceGit(repo, true);
  assert.ok(calls.length > changedCount);
  setFail(true);
  await assert.rejects(inspectResourceGit(repo, true), /RESOURCE_GIT_FAILED/);
  const failedCount = calls.length;
  assert.equal((await inspectResourceGit(repo)).remoteUrl, "https://example.com/team/second.git");
  assert.equal(calls.length, failedCount, "强制刷新失败不能覆盖旧缓存");
});

test("Git include 文件变化、之前缺失的 include 文件创建都会更新远程缓存", async (context) => {
  const { repo, directory, git, calls, inspectResourceGit } = await fixture(context);
  const included = path.join(directory, "remotes.config");
  await git("config", "include.path", included);
  assert.deepEqual(await inspectResourceGit(repo), { isRepository: true, remoteUrl: null });
  await writeFile(included, '[remote "origin"]\nurl = https://example.com/first.git\n');
  assert.equal((await inspectResourceGit(repo)).remoteUrl, "https://example.com/first.git");
  const count = calls.length;
  await inspectResourceGit(repo);
  assert.equal(calls.length, count);
  await writeFile(included, '[remote "origin"]\nurl = https://example.com/other.git\n');
  assert.equal((await inspectResourceGit(repo)).remoteUrl, "https://example.com/other.git");
  await rm(included);
  assert.deepEqual(await inspectResourceGit(repo), { isRepository: true, remoteUrl: null });
});

test("Worktree 跟踪公共配置，普通文件夹初始化为 Git 后不沿用旧状态", async (context) => {
  const { repo, directory, git, inspectResourceGit } = await fixture(context);
  await git("-c", "user.name=Navo Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "--no-gpg-sign", "-m", "fixture");
  await git("remote", "add", "origin", "git@example.com:team/first.git");
  const worktree = path.join(directory, "worktree");
  await git("worktree", "add", "--detach", worktree);
  assert.equal((await inspectResourceGit(worktree)).remoteUrl, "git@example.com:team/first.git");
  await git("remote", "set-url", "origin", "git@example.com:team/second.git");
  assert.equal((await inspectResourceGit(worktree)).remoteUrl, "git@example.com:team/second.git");
  const folder = path.join(directory, "folder");
  await mkdir(folder);
  assert.deepEqual(await inspectResourceGit(folder), { isRepository: false, remoteUrl: null });
  await execute("git", ["init", "--quiet", folder]);
  assert.deepEqual(await inspectResourceGit(folder), { isRepository: true, remoteUrl: null });
  await rm(path.join(folder, ".git"), { recursive: true });
  assert.deepEqual(await inspectResourceGit(folder), { isRepository: false, remoteUrl: null });
});

test("渲染缓存立即可读、隔离目录、合并请求，刷新失败保留旧数据且可重试", async () => {
  const calls = [];
  let finish;
  let fail = false;
  const loader = createLoader({ "./resourceApi": { resourceApi: { inspectGit: (localPath, forced) => {
    calls.push({ localPath, forced });
    if (fail) throw new Error("Git unavailable");
    return new Promise((resolve) => { finish = resolve; });
  } } } });
  const { getCachedResourceGitInfo, loadResourceGitInfo, refreshResourceGitInfoCache } = loader("src/services/resourceGitInfoCache.ts");
  const first = loadResourceGitInfo("/repo");
  const duplicate = loadResourceGitInfo(" /repo ");
  assert.equal(first, duplicate);
  await Promise.resolve();
  const info = { isRepository: true, remoteUrl: "https://example.com/repo.git" };
  finish(info); await first;
  assert.equal(calls.length, 1);
  assert.deepEqual(getCachedResourceGitInfo("/repo"), info);
  assert.equal(getCachedResourceGitInfo("/other"), null);
  fail = true;
  await refreshResourceGitInfoCache(["/repo", "/other"]);
  assert.deepEqual(calls.at(-1), { localPath: "/repo", forced: true });
  assert.equal(calls.length, 2, "手动刷新不主动扫描未打开过的资源");
  assert.deepEqual(getCachedResourceGitInfo("/repo"), info);
  fail = false;
  const retry = loadResourceGitInfo("/repo"); await Promise.resolve();
  finish({ isRepository: true, remoteUrl: null }); await retry;
  assert.deepEqual(getCachedResourceGitInfo("/repo"), { isRepository: true, remoteUrl: null });
});

test("手动刷新等待已有查询后再强制读取，不被旧请求吞掉", async () => {
  const calls = [];
  const resolvers = [];
  const { loadResourceGitInfo, getCachedResourceGitInfo } = createLoader({ "./resourceApi": { resourceApi: {
    inspectGit: (_path, forced) => { calls.push(forced); return new Promise((resolve) => resolvers.push(resolve)); },
  } } })("src/services/resourceGitInfoCache.ts");
  const first = loadResourceGitInfo("/repo");
  const refresh = loadResourceGitInfo("/repo", true);
  await Promise.resolve();
  resolvers[0]({ isRepository: true, remoteUrl: "old" });
  await first;
  for (let count = 0; count < 10 && resolvers.length < 2; count++) await Promise.resolve();
  assert.deepEqual(calls, [false, true]);
  resolvers[1]({ isRepository: true, remoteUrl: "new" });
  await refresh;
  assert.equal(getCachedResourceGitInfo("/repo").remoteUrl, "new");
});
