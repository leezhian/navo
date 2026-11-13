import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const load = createLoader({ electron: { shell: {} } });
const { repositoryWebLink } = load("src/utils/repositoryWebLink.ts");
const { InstalledEditorsCache, EDITOR_CACHE_MS, EDITOR_RETRY_MS, matchesEditorBundle } = load("src/main-process/services/editors/installedEditors.ts");
const { editorCatalog } = load("src/main-process/services/editors/editorCatalog.ts");
const { TaskWorkspaceOpenService } = load("src/main-process/services/taskWorkspaceOpenService.ts");

test("上次打开方式沿用 SQLite 设置持久化，非法或不可用目标回退文件管理器", async context => {
  const { normalizeAppSettings } = load("src/domain/settings.ts");
  const { availableWorkspaceOpenTarget } = load("src/utils/workspaceOpenTarget.ts");
  const { writeSettingsDatabase, readSettingsDatabase } = load("src/main-process/services/settingsDatabase.ts");
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-open-target-"));context.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "app.db");const target = { kind: "editor", editorId: "cursor" };
  await writeSettingsDatabase(filename, normalizeAppSettings({ lastWorkspaceOpenTarget: target }));
  assert.deepEqual((await readSettingsDatabase(filename)).lastWorkspaceOpenTarget, target);
  assert.deepEqual(normalizeAppSettings({ lastWorkspaceOpenTarget: { kind: "editor", editorId: "arbitrary" } }).lastWorkspaceOpenTarget, { kind: "fileManager" });
  assert.deepEqual(normalizeAppSettings({}).lastWorkspaceOpenTarget, { kind: "fileManager" });
  const options = { editors: [{ id: "cursor", name: "Cursor" }], remote: null, externalTerminal: false };
  assert.deepEqual(availableWorkspaceOpenTarget(target, options), target);
  for (const unavailable of [{ kind: "remote" }, { kind: "terminal" }, { kind: "editor", editorId: "vscode" }]) assert.deepEqual(availableWorkspaceOpenTarget(unavailable, options), { kind: "fileManager" });
});

test("远端网页转换：SSH/HTTPS、嵌套 GitLab、认证剥离、未知主机不冒充平台", () => {
  assert.deepEqual(repositoryWebLink("git@github.com:org/repo.git"), { provider: "GitHub", url: "https://github.com/org/repo" });
  assert.deepEqual(repositoryWebLink("ssh://git@gitlab.company.com:2222/group/sub/repo.git"), { provider: "GitLab", url: "https://gitlab.company.com/group/sub/repo" });
  assert.deepEqual(repositoryWebLink("https://user:secret@git.company.com:8443/team/repo.git?token=secret#branch"), { provider: "git.company.com", url: "https://git.company.com:8443/team/repo" });
  assert.deepEqual(repositoryWebLink("git@bitbucket.org:team/repo.git"), { provider: "Bitbucket", url: "https://bitbucket.org/team/repo" });
  assert.deepEqual(repositoryWebLink("https://gitee.com/team/repo.git"), { provider: "Gitee", url: "https://gitee.com/team/repo" });
  assert.equal(repositoryWebLink("https://github.com.example.org/team/repo.git").provider, "github.com.example.org");
  for (const value of [null, "", "javascript:alert(1)", "file:///private/repo", "/local/repo", "https://github.com/team/a%2Fb", "https://github.com/team/a%00b"]) assert.equal(repositoryWebLink(value), null);
});

test("IDE 半小时内存缓存：并发合并、过期重查、失败保留与退避、失效重扫", async () => {
  let scans = 0;let now = 0;let fail = false;let release;
  const gate = new Promise(resolve => { release = resolve; });
  const known = [{ id: "vscode", name: "VS Code", appPath: "/fixture/Code.app" }];
  const cache = new InstalledEditorsCache(async () => { scans++;await gate;if (fail) throw Error("scan failed");return known; }, () => now);
  const first = cache.list(), second = cache.list();release();
  assert.deepEqual(await first, known);assert.deepEqual(await second, known);assert.equal(scans, 1);
  assert.equal(EDITOR_CACHE_MS, 30 * 60 * 1000);assert.deepEqual(cache.find("vscode"), known[0]);
  now = EDITOR_CACHE_MS - 1;await cache.list();assert.equal(scans, 1);
  now = EDITOR_CACHE_MS;await cache.list();assert.equal(scans, 2);
  now += EDITOR_CACHE_MS;fail = true;assert.deepEqual(await cache.list(), known);
  fail = false;await cache.list();assert.equal(scans, 3);
  now += EDITOR_RETRY_MS;await cache.list();assert.equal(scans, 4);
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
    let scans = 0, now = 0;
    const cache = new InstalledEditorsCache(async () => { scans++;return [{ id: "vscode", name: "VS Code", appPath: "/fixture/Code.app" }]; }, () => now);
    const host = { platform: "darwin", inspect: async cwd => { assert.equal(cwd, actual);return { isRepository: true, remoteUrl: remote }; }, openPath: async cwd => { paths.push(cwd);return ""; }, openExternal: async url => { urls.push(url); }, launch: async (...args) => { launches.push(args); }, matchesEditor: async () => installed, terminalAvailable: async () => true };
    const service = new TaskWorkspaceOpenService(async () => tasks, cache, host);
    const options = await service.options("task", "repo");assert.deepEqual(options.editors, [{ id: "vscode", name: "VS Code" }]);assert.equal(options.remote.provider, "GitHub");assert.equal(options.remoteUrl, remote);
    await service.open("task", "repo", { kind: "fileManager" });assert.deepEqual(paths, [actual]);
    await service.open("task", "repo", { kind: "terminal" });assert.deepEqual(launches[0], ["/System/Applications/Utilities/Terminal.app", actual]);
    now = EDITOR_CACHE_MS;
    await service.open("task", "repo", { kind: "editor", editorId: "vscode" });assert.deepEqual(launches[1], ["/fixture/Code.app", actual]);assert.equal(scans, 1);
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

test("编辑器检测只返回安装信息，不读取或转换系统图标", { skip: process.platform !== "darwin" }, async () => {
  const iconReads = [];
  const runtime = createLoader({
    electron: { app: { getFileIcon: async filename => {
      iconReads.push(filename);
      if (filename.endsWith("Xcode.app")) throw Error("No icon");
      return { isEmpty: () => false, toDataURL: () => "data:image/png;base64,fixture" };
    } } },
    "node:fs/promises": {
      readdir: async directory => directory === "/Applications" ? ["Visual Studio Code.app", "Xcode.app"].map(name => ({ name, isDirectory: () => true })) : [],
      stat: async () => ({ isDirectory: () => true }), realpath: async filename => filename,
    },
    "node:util": { promisify: () => async (command, args) => ({ stdout: command.endsWith("plutil") ? args.at(-1).includes("Xcode.app") ? "com.apple.dt.Xcode" : "com.microsoft.VSCode" : "" }) },
  });
  const { detectInstalledEditors } = runtime("src/main-process/services/editors/installedEditors.ts");
  const editors = await detectInstalledEditors();
  assert.deepEqual(editors.map(editor => editor.id), ["vscode", "xcode"]);
  assert.ok(editors.every(editor => !Object.hasOwn(editor, "icon")));
  assert.deepEqual(iconReads, []);
});

test("常用编辑器按 ID 使用不同的品牌 SVG，未映射项回退通用编辑器图标", () => {
  const { EditorIcon } = load("src/components/icons/EditorIcon.tsx");
  const { WorkspaceTargetIcon } = load("src/components/tasks/workspace/WorkspaceTargetIcon.tsx");
  const marks = new Set();
  for (const editorId of ["vscode", "cursor", "windsurf", "xcode", "idea", "webstorm", "pycharm", "goland", "zed", "sublime"]) {
    const markup = renderToStaticMarkup(createElement(WorkspaceTargetIcon, { target: { kind: "editor", editorId }, options: null }));
    assert.ok(markup.includes(`data-editor="${editorId}"`));assert.ok(markup.includes("<path"));assert.ok(!markup.includes("<img"));marks.add(markup.match(/ d="([^"]+)"/)[1]);
  }
  assert.equal(marks.size, 10);
  assert.match(renderToStaticMarkup(createElement(EditorIcon, { editorId: "future-editor" })), /lucide-code/);
});

test("打开方式预读缓存：多视图合并、切页复用、到期刷新、失败保留与路径隔离", async context => {
  context.mock.timers.enable({ apis: ["Date"], now: 1000 });
  let reads = 0, fail = false, release;
  const gate = new Promise(resolve => { release = resolve; });
  let options = { editors: [{ id: "vscode", name: "VS Code" }], remote: null, externalTerminal: true };
  const runtime = createLoader({ "./taskApi": { getTasksApi: () => ({ workspaceOpenOptions: async () => { reads++;await gate;if (fail) throw Error("Unavailable");return options; } }) } });
  const { workspaceOptionsKey, loadWorkspaceOptions, cachedWorkspaceOptions, invalidateWorkspaceOptions, WORKSPACE_OPTIONS_CACHE_MS, WORKSPACE_OPTIONS_RETRY_MS } = runtime("src/services/workspaceOpenOptions.ts");
  const key = workspaceOptionsKey("task", "repo", "/worktree");
  assert.equal(cachedWorkspaceOptions(key), null);
  const first = loadWorkspaceOptions(key, "task", "repo"), second = loadWorkspaceOptions(key, "task", "repo");release();
  assert.strictEqual(first, second);assert.deepEqual(await first, options);assert.equal(reads, 1);
  await loadWorkspaceOptions(key, "task", "repo");assert.equal(reads, 1);
  assert.deepEqual(cachedWorkspaceOptions(key), options);
  context.mock.timers.tick(WORKSPACE_OPTIONS_CACHE_MS);fail = true;
  assert.deepEqual(await loadWorkspaceOptions(key, "task", "repo"), options);assert.equal(reads, 2);
  await loadWorkspaceOptions(key, "task", "repo");assert.equal(reads, 2);
  fail = false;context.mock.timers.tick(WORKSPACE_OPTIONS_RETRY_MS);
  options = { ...options, editors: [] };assert.deepEqual(await loadWorkspaceOptions(key, "task", "repo"), options);assert.equal(reads, 3);
  await loadWorkspaceOptions(workspaceOptionsKey("task", "repo", "/new-path"), "task", "repo");assert.equal(reads, 4);
  await loadWorkspaceOptions(workspaceOptionsKey("other-task", "repo", "/worktree"), "other-task", "repo");assert.equal(reads, 5);
  invalidateWorkspaceOptions(key);await loadWorkspaceOptions(key, "task", "repo");assert.equal(reads, 6);
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
