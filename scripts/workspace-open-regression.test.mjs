import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader({ electron: { shell: {} } });
const { repositoryWebLink } = load("src/utils/repositoryWebLink.ts");
const { InstalledEditorsCache, EDITOR_CACHE_MS, matchesEditorBundle } = load("src/main-process/services/editors/installedEditors.ts");
const { editorCatalog } = load("src/main-process/services/editors/editorCatalog.ts");
const { TaskWorkspaceOpenService } = load("src/main-process/services/taskWorkspaceOpenService.ts");

test("远端网页转换：SSH/HTTPS、嵌套 GitLab、认证剥离、未知主机不冒充平台", () => {
  assert.deepEqual(repositoryWebLink("git@github.com:org/repo.git"), { provider: "GitHub", url: "https://github.com/org/repo" });
  assert.deepEqual(repositoryWebLink("ssh://git@gitlab.company.com:2222/group/sub/repo.git"), { provider: "GitLab", url: "https://gitlab.company.com/group/sub/repo" });
  assert.deepEqual(repositoryWebLink("https://user:secret@git.company.com:8443/team/repo.git?token=secret#branch"), { provider: "git.company.com", url: "https://git.company.com:8443/team/repo" });
  for (const value of [null, "", "javascript:alert(1)", "file:///private/repo", "/local/repo", "https://github.com/team/a%2Fb", "https://github.com/team/a%00b"]) assert.equal(repositoryWebLink(value), null);
});

test("IDE 五分钟内存缓存：并发合并、过期重查、失败保留、失效重扫", async () => {
  let scans = 0;let now = 0;let fail = false;let release;
  const gate = new Promise(resolve => { release = resolve; });
  const known = [{ id: "vscode", name: "VS Code", appPath: "/fixture/Code.app" }];
  const cache = new InstalledEditorsCache(async () => { scans++;await gate;if (fail) throw Error("scan failed");return known; }, () => now);
  const first = cache.list(), second = cache.list();release();
  assert.deepEqual(await first, known);assert.deepEqual(await second, known);assert.equal(scans, 1);
  now = EDITOR_CACHE_MS - 1;await cache.list();assert.equal(scans, 1);
  now = EDITOR_CACHE_MS;await cache.list();assert.equal(scans, 2);
  now += EDITOR_CACHE_MS;fail = true;assert.deepEqual(await cache.list(), known);
  fail = false;await cache.list();assert.equal(scans, 4);
  cache.invalidate();await cache.list();assert.equal(scans, 5);
});

test("工作目录打开严格绑定任务：使用 Worktree，外部终端不创建 Navo 会话，点击时重新读取远端", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-workspace-open-"));
  try {
    const directory = path.join(root, "worktree with spaces;$(echo nope)");await mkdir(directory);
    const actual = await realpath(directory);
    const tasks = [{ id: "task", resources: [{ resourceId: "repo", mode: "worktree", workingPath: directory, originalPath: "/unused/original" }] }];
    const launches = [], paths = [], urls = [];
    let remote = "git@github.com:org/repo.git", installed = true;
    const cache = new InstalledEditorsCache(async () => [{ id: "vscode", name: "VS Code", appPath: "/fixture/Code.app" }]);
    const host = { platform: "darwin", inspect: async cwd => { assert.equal(cwd, actual);return { isRepository: true, remoteUrl: remote }; }, openPath: async cwd => { paths.push(cwd);return ""; }, openExternal: async url => { urls.push(url); }, launch: async (...args) => { launches.push(args); }, matchesEditor: async () => installed, terminalAvailable: async () => true };
    const service = new TaskWorkspaceOpenService(async () => tasks, cache, host);
    const options = await service.options("task", "repo");assert.deepEqual(options.editors, [{ id: "vscode", name: "VS Code" }]);assert.equal(options.remote.provider, "GitHub");
    await service.open("task", "repo", { kind: "fileManager" });assert.deepEqual(paths, [actual]);
    await service.open("task", "repo", { kind: "terminal" });assert.deepEqual(launches[0], ["/System/Applications/Utilities/Terminal.app", actual]);
    await service.open("task", "repo", { kind: "editor", editorId: "vscode" });assert.deepEqual(launches[1], ["/fixture/Code.app", actual]);
    remote = "git@gitlab.com:team/repo.git";await service.open("task", "repo", { kind: "remote" });assert.deepEqual(urls, ["https://gitlab.com/team/repo"]);
    await assert.rejects(service.open("wrong", "repo", { kind: "fileManager" }), /NOT_FOUND/);
    await assert.rejects(service.open("task", "/arbitrary", { kind: "fileManager" }), /NOT_FOUND/);
    await assert.rejects(service.open("task", "repo", { kind: "editor", editorId: "injected --command" }), /INVALID/);
    installed = false;await assert.rejects(service.open("task", "repo", { kind: "editor", editorId: "vscode" }), /EDITOR_UNAVAILABLE/);
    remote = null;await assert.rejects(service.open("task", "repo", { kind: "remote" }), /REMOTE_UNAVAILABLE/);
    await rm(directory, { recursive: true });await assert.rejects(service.open("task", "repo", { kind: "fileManager" }));
    assert.equal(launches.length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("macOS 应用检测校验 Bundle ID，不凭文件名认定安装", { skip: process.platform !== "darwin" }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-editor-detection-"));
  try {
    const bundle = path.join(root, "Visual Studio Code.app");await mkdir(path.join(bundle, "Contents"), { recursive: true });
    const plist = path.join(bundle, "Contents/Info.plist");
    const info = id => `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${id}</string></dict></plist>`;
    await writeFile(plist, info("not.vscode"));assert.equal(await matchesEditorBundle(bundle, editorCatalog[0]), false);
    await writeFile(plist, info("com.microsoft.VSCode"));assert.equal(await matchesEditorBundle(bundle, editorCatalog[0]), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
