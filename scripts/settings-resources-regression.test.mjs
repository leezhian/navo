import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, stat, symlink, truncate, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const require = createRequire(import.meta.url);

function createLoader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = { exports: {} };
    cache.set(absolute, module);
    const { outputText } = ts.transpileModule(readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    });
    const localRequire = (name) => {
      if (name in mocks) return mocks[name];
      if (name.startsWith(".")) return load(path.resolve(path.dirname(absolute), name) + ".ts");
      if (name.startsWith("@/")) return load("src/" + name.slice(2) + ".ts");
      return require(name);
    };
    new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
}

async function temporaryDirectory(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-regression-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

const load = createLoader();
const { defaultSettings, normalizeAppSettings } = load("src/domain/settings.ts");
const { resolveResourcePath, validateCloneUrl, validateRepositoryName, redactCloneOutput } = load("src/main-process/services/resourcePaths.ts");
const { getRepositoryName, getFolderName } = load("src/utils/resourceNames.ts");

test("仓库名称从 HTTPS、SSH 和 SCP 地址自动提取", () => {
  for (const url of ["https://github.com/team/navo.git", "https://github.com/team/navo", "https://github.com/team/navo.git/", "ssh://git@example.com:2222/team/navo.git", "git@example.com:team/navo.git"]) {
    assert.equal(getRepositoryName(url), "navo");
  }
  assert.equal(getRepositoryName("https://example.com/team/%E9%A1%B9%E7%9B%AE.git"), "项目");
  assert.throws(() => getRepositoryName("https://example.com/"), /INVALID_REPOSITORY_URL/);
  assert.throws(() => getRepositoryName("https://example.com/bad%ZZ.git"), /INVALID_REPOSITORY_URL/);
  assert.throws(() => validateRepositoryName(getRepositoryName("https://example.com/team/bad%2Fname.git")), /INVALID_REPOSITORY_NAME/);
  assert.equal(getFolderName("/Users/kim/Project/navo/"), "navo");
  assert.equal(getFolderName("C:\\Projects\\navo"), "navo");
  assert.equal(getFolderName("/"), "/");
});

test("选择本地目录后直接添加，取消不写入，失败向调用方报告", async () => {
  const originalWindow = globalThis.window;
  const saved = [];
  let chosenPath = null;
  let failure = null;
  globalThis.window = { navo: {
    settings: { chooseDirectory: async () => chosenPath },
    resources: { save: async (params) => {
      if (failure) throw failure;
      saved.push(params);
      return { ...params, id: "folder-id", available: true };
    } },
  } };
  try {
    const { resourceApi } = createLoader()("src/services/resourceApi.ts");
    assert.equal(await resourceApi.chooseAndAddFolder(), null);
    assert.equal(saved.length, 0);
    chosenPath = "/Users/kim/Project/navo";
    const record = await resourceApi.chooseAndAddFolder();
    assert.deepEqual(saved[0], { kind: "folder", name: "navo", localPath: chosenPath });
    assert.equal(record.id, "folder-id");
    failure = new Error("DUPLICATE_RESOURCE");
    await assert.rejects(resourceApi.chooseAndAddFolder(), /DUPLICATE_RESOURCE/);
    assert.equal(saved.length, 1);
  } finally { globalThis.window = originalWindow; }
});

test("设置默认英文与隔离工作区，保留旧外观并移除旧日志配置", () => {
  const settings = normalizeAppSettings({ theme: "dark", diffCodeFontSize: 18, branchPrefix: "" });
  assert.equal(settings.locale, "en");
  assert.equal(settings.defaultTaskMode, "worktree");
  assert.equal(settings.repositoriesDirectory, "~/Navo/repos");
  assert.equal(settings.worktreesDirectory, "~/Navo/worktrees");
  assert.equal(settings.branchPrefix, "");
  assert.equal(settings.theme, "dark");
  assert.equal(settings.diffCodeFontSize, 18);
  const migrated = normalizeAppSettings({ theme: "dark", saveLogs: false, logsDirectory: "/old/logs", logRetentionDays: 7 });
  assert.equal(migrated.theme, "dark");
  for (const key of ["saveLogs", "logsDirectory", "logRetentionDays"]) {
    assert.equal(key in migrated, false);
    assert.equal(key in defaultSettings, false);
  }
});

test("克隆参数拒绝密码、token、无效协议、路径逃逸及相对目录", () => {
  for (const url of ["https://github.com/team/repo.git", "git@github.com:team/repo.git", "ssh://git@example.com/team/repo.git"]) assert.equal(validateCloneUrl(url), url);
  for (const url of ["file:///tmp/repo", "http://example.com/repo", "--upload-pack=evil", "https://user:secret@example.com/repo", "https://example.com/repo?token=secret", "ssh://git@example.com/", "ssh://git@-option/repo", "git@-option:repo.git"]) assert.throws(() => validateCloneUrl(url), /INVALID_REPOSITORY_URL/);
  for (const name of ["..", ".", "../repo", "repo/name", "repo name"]) assert.throws(() => validateRepositoryName(name), /INVALID_REPOSITORY_NAME/);
  assert.equal(validateRepositoryName("项目-1"), "项目-1");
  assert.throws(() => resolveResourcePath("relative"), /INVALID_DIRECTORY/);
  assert.equal(resolveResourcePath("~/Navo/repos"), path.join(os.homedir(), "Navo/repos"));
  const output = redactCloneOutput("https://user:secret@example.com/repo token=secret password=secret authorization=secret");
  assert.ok(!output.includes("secret"));
});

test("资源 CRUD 原子持久化、规范路径去重，移除不删除本地文件", async (context) => {
  const directory = await temporaryDirectory(context);
  const folder = path.join(directory, "folder");
  await mkdir(folder);
  await writeFile(path.join(folder, "keep.txt"), "keep");
  const storage = path.join(directory, "resources.json");
  const { ResourceService } = createLoader()("src/main-process/services/resourceService.ts");
  const service = new ResourceService(storage);
  const record = await service.save({ kind: "folder", name: "First", localPath: folder });
  const alias = path.join(directory, "alias");
  await symlink(folder, alias);
  await assert.rejects(service.save({ kind: "folder", name: "Duplicate", localPath: alias }), /DUPLICATE_RESOURCE/);
  const edited = await service.save({ id: record.id, kind: "folder", name: "Renamed", localPath: alias });
  assert.equal(edited.id, record.id);
  assert.equal(edited.localPath, await import("node:fs/promises").then(({ realpath }) => realpath(folder)));
  assert.equal((await new ResourceService(storage).list())[0].name, "Renamed");
  await service.remove(record.id);
  assert.deepEqual(await service.list(), []);
  assert.equal(await readFile(path.join(folder, "keep.txt"), "utf8"), "keep");
});

test("并发资源写入不丢记录，刷新标记失效路径", async (context) => {
  const directory = await temporaryDirectory(context);
  const { ResourceService } = createLoader()("src/main-process/services/resourceService.ts");
  const service = new ResourceService(path.join(directory, "records.json"));
  const folders = ["first", "second"].map((name) => path.join(directory, name));
  await Promise.all(folders.map((folder) => mkdir(folder)));
  await Promise.all(folders.map((folder) => service.save({ kind: "folder", name: path.basename(folder), localPath: folder })));
  assert.equal((await service.list()).length, 2);
  await rm(folders[0], { recursive: true });
  const records = await service.list();
  assert.equal(records.find((record) => record.name === "first").available, false);
  assert.equal(records.find((record) => record.name === "second").available, true);
});

test("损坏存储明确失败，不用空列表覆盖数据", async (context) => {
  const directory = await temporaryDirectory(context);
  const storage = path.join(directory, "records.json");
  await writeFile(storage, "{bad");
  const { ResourceService } = createLoader()("src/main-process/services/resourceService.ts");
  const service = new ResourceService(storage);
  await assert.rejects(service.list(), /INVALID_RESOURCE_STORAGE/);
  await assert.rejects(service.save({ kind: "folder", name: "test", localPath: directory }), /INVALID_RESOURCE_STORAGE/);
  assert.equal(await readFile(storage, "utf8"), "{bad");
});

function fakeGit(mode, calls) {
  return { spawn(command, args, options) {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout = { resume() {} };
    child.exitCode = null;
    child.signalCode = null;
    child.kill = () => { setImmediate(() => { child.signalCode = "SIGTERM"; child.emit("close", null); }); return true; };
    setImmediate(() => {
      child.stderr.emit("data", Buffer.from("Cloning into repository… token=secret"));
      if (mode === "success" || mode === "failure") { child.exitCode = mode === "success" ? 0 : 128; child.emit("close", child.exitCode); }
      if (mode === "missing") { child.emit("error", new Error("ENOENT")); child.emit("close", -2); }
    });
    return child;
  } };
}

test("克隆进度脱敏、使用参数数组执行 Git，成功后一次保存 remote 元数据", async (context) => {
  const directory = await temporaryDirectory(context);
  const calls = [];
  const { ResourceService } = createLoader({ "node:child_process": fakeGit("success", calls) })("src/main-process/services/resourceService.ts");
  const service = new ResourceService(path.join(directory, "records.json"));
  const progress = [];
  const record = await service.clone({ operationId: "clone-success", url: "git@github.com:team/repo.git", name: "repo", directory }, 1, (value) => progress.push(value));
  assert.equal(calls[0].command, "git");
  assert.deepEqual(calls[0].args.slice(0, 4), ["clone", "--progress", "--", "git@github.com:team/repo.git"]);
  assert.equal(calls[0].options.env.GIT_TERMINAL_PROMPT, "0");
  assert.ok(progress.length > 0);
  assert.ok(progress.every((value) => !value.message.includes("secret")));
  const edited = await service.save({ id: record.id, kind: "repo", name: "Renamed", localPath: record.localPath });
  assert.equal(edited.remoteUrl, record.remoteUrl);
  assert.equal((await service.list())[0].remoteUrl, "git@github.com:team/repo.git");
});

test("已有目标目录不能被覆盖，克隆失败仅清理本次新建目录", async (context) => {
  const directory = await temporaryDirectory(context);
  const calls = [];
  const { ResourceService } = createLoader({ "node:child_process": fakeGit("failure", calls) })("src/main-process/services/resourceService.ts");
  const service = new ResourceService(path.join(directory, "records.json"));
  await mkdir(path.join(directory, "existing"));
  await writeFile(path.join(directory, "existing", "keep.txt"), "keep");
  const params = { operationId: "operation", url: "https://github.com/team/repo.git", name: "existing", directory };
  await assert.rejects(service.clone(params, 1, () => undefined), /DIRECTORY_EXISTS/);
  assert.equal(calls.length, 0);
  await assert.rejects(service.clone({ ...params, name: "new-repo" }, 1, () => undefined), /CLONE_FAILED/);
  await assert.rejects(access(path.join(directory, "new-repo")), /ENOENT/);
  assert.equal(await readFile(path.join(directory, "existing", "keep.txt"), "utf8"), "keep");
});

test("立即取消不会漏掉请求，取消只接受操作所属窗口", async (context) => {
  const directory = await temporaryDirectory(context);
  const calls = [];
  const { ResourceService } = createLoader({ "node:child_process": fakeGit("waiting", calls) })("src/main-process/services/resourceService.ts");
  const service = new ResourceService(path.join(directory, "records.json"));
  const params = { operationId: "cancel-early", url: "https://github.com/team/repo.git", name: "early", directory };
  const early = service.clone(params, 1, () => undefined);
  service.cancel(params.operationId, 1);
  await assert.rejects(early, /CLONE_CANCELLED/);
  assert.equal(calls.length, 0);
  let notifyStarted;
  const started = new Promise((resolve) => { notifyStarted = resolve; });
  const waiting = service.clone({ ...params, operationId: "cancel-late", name: "late" }, 1, notifyStarted);
  await started;
  service.cancel("cancel-late", 2);
  assert.ok(await stat(path.join(directory, "late")));
  service.cancel("cancel-late", 1);
  await assert.rejects(waiting, /CLONE_CANCELLED/);
  await assert.rejects(access(path.join(directory, "late")), /ENOENT/);
});

test("Git 不可用时正确回报错误并清理目录", async (context) => {
  const directory = await temporaryDirectory(context);
  const { ResourceService } = createLoader({ "node:child_process": fakeGit("missing", []) })("src/main-process/services/resourceService.ts");
  const service = new ResourceService(path.join(directory, "records.json"));
  await assert.rejects(service.clone({ operationId: "missing-git", url: "https://github.com/team/repo.git", name: "repo", directory }, 1, () => undefined), /GIT_UNAVAILABLE/);
  await assert.rejects(access(path.join(directory, "repo")), /ENOENT/);
});

test("克隆成功但记录写入失败时保留仓库，不伪造已添加记录", async (context) => {
  const directory = await temporaryDirectory(context);
  const storage = path.join(directory, "records.json");
  await mkdir(storage);
  const { ResourceService } = createLoader({ "node:child_process": fakeGit("success", []) })("src/main-process/services/resourceService.ts");
  const service = new ResourceService(storage);
  await assert.rejects(service.clone({ operationId: "record-failure", url: "https://github.com/team/repo.git", name: "repo", directory }, 1, () => undefined), /CLONE_RECORD_FAILED/);
  assert.equal((await stat(path.join(directory, "repo"))).isDirectory(), true);
});

test("窗口关闭的取消入口等待所属克隆清理完成", async (context) => {
  const directory = await temporaryDirectory(context);
  const { ResourceService } = createLoader({ "node:child_process": fakeGit("waiting", []) })("src/main-process/services/resourceService.ts");
  const service = new ResourceService(path.join(directory, "records.json"));
  let notifyStarted;
  const started = new Promise((resolve) => { notifyStarted = resolve; });
  const clone = service.clone({ operationId: "window-close", url: "https://github.com/team/repo.git", name: "repo", directory }, 1, notifyStarted);
  const rejected = assert.rejects(clone, /CLONE_CANCELLED/);
  await started;
  await service.cancelAll(1);
  await rejected;
  await assert.rejects(access(path.join(directory, "repo")), /ENOENT/);
});

test("SQLite 配置串行读写，磁盘失败不更新缓存且队列可重试", async (context) => {
  const directory = await temporaryDirectory(context);
  const load = createLoader({ electron: { app: { getPath: () => directory } } });
  const service = load("src/main-process/services/settingsService.ts");
  assert.equal((await service.loadSettings()).settings, null);
  await Promise.all([service.saveSettings({ ...defaultSettings, theme: "light" }), service.saveSettings({ ...defaultSettings, theme: "dark", locale: "zh-CN" })]);
  assert.equal((await service.loadSettings()).settings.theme, "dark");
  assert.equal(service.getCurrentSettings().locale, "zh-CN");
  const databasePath = path.join(directory, "app.db");
  assert.equal((await readFile(databasePath)).subarray(0, 15).toString(), "SQLite format 3");
  await assert.rejects(access(path.join(directory, "settings.json")), /ENOENT/);
  await rm(databasePath);
  await mkdir(databasePath);
  await assert.rejects(service.saveSettings(defaultSettings));
  assert.equal(service.getCurrentSettings().theme, "dark");
  await rm(databasePath, { recursive: true });
  const saving = service.saveSettings({ ...defaultSettings, theme: "light" });
  const loading = service.loadSettings();
  await service.flushSettings();
  await saving;
  assert.equal((await loading).settings.theme, "light");
});

test("旧 JSON 迁入 SQLite 并保留备份，重新加载只读取数据库", async (context) => {
  const directory = await temporaryDirectory(context);
  const jsonPath = path.join(directory, "settings.json");
  const original = JSON.stringify({ ...defaultSettings, theme: "dark", locale: "zh-CN", branchPrefix: "自定义/", diffCodeFontSize: 18 });
  await writeFile(jsonPath, original);
  const mocks = { electron: { app: { getPath: () => directory } } };
  const service = createLoader(mocks)("src/main-process/services/settingsService.ts");
  const migrated = (await service.loadSettings()).settings;
  assert.equal(migrated.theme, "dark");
  assert.equal(migrated.locale, "zh-CN");
  assert.equal(migrated.branchPrefix, "自定义/");
  assert.equal(migrated.diffCodeFontSize, 18);
  assert.equal(await readFile(jsonPath, "utf8"), original);
  const database = new DatabaseSync(path.join(directory, "app.db"));
  try {
    assert.equal(database.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 1);
    assert.equal(JSON.parse(database.prepare("SELECT value FROM settings WHERE key = ?").get("theme").value), "dark");
  } finally { database.close(); }
  await writeFile(jsonPath, "invalid legacy JSON");
  const restarted = createLoader(mocks)("src/main-process/services/settingsService.ts");
  assert.deepEqual((await restarted.loadSettings()).settings, migrated);
  await restarted.saveSettings({ ...migrated, theme: "light" });
  assert.equal(await readFile(jsonPath, "utf8"), "invalid legacy JSON");
  assert.equal((await createLoader(mocks)("src/main-process/services/settingsService.ts").loadSettings()).settings.theme, "light");
});

test("旧 JSON 损坏时不导入默认值，修复后可重新迁移", async (context) => {
  const directory = await temporaryDirectory(context);
  const jsonPath = path.join(directory, "settings.json");
  const service = createLoader({ electron: { app: { getPath: () => directory } } })("src/main-process/services/settingsService.ts");
  for (const invalid of ["{bad", "[]", '"settings"', "null"]) {
    await writeFile(jsonPath, invalid);
    await assert.rejects(service.loadSettings(), /INVALID_SETTINGS/);
    assert.equal(await readFile(jsonPath, "utf8"), invalid);
    const database = new DatabaseSync(path.join(directory, "app.db"));
    try { assert.equal(database.prepare("SELECT count(*) AS count FROM settings").get().count, 0); }
    finally { database.close(); }
  }
  await writeFile(jsonPath, JSON.stringify({ theme: "dark" }));
  assert.equal((await service.loadSettings()).settings.theme, "dark");
});

test("SQLite 整组更新失败时回滚所有键并保留缓存", async (context) => {
  const directory = await temporaryDirectory(context);
  const service = createLoader({ electron: { app: { getPath: () => directory } } })("src/main-process/services/settingsService.ts");
  await service.saveSettings(defaultSettings);
  const database = new DatabaseSync(path.join(directory, "app.db"));
  try {
    database.exec("CREATE TRIGGER reject_settings BEFORE INSERT ON settings WHEN NEW.key = 'worktreesDirectory' BEGIN SELECT RAISE(ABORT, 'test write failure'); END");
    await assert.rejects(service.saveSettings({ ...defaultSettings, theme: "dark", locale: "zh-CN" }), /test write failure/);
    assert.deepEqual(service.getCurrentSettings(), defaultSettings);
    assert.deepEqual((await service.loadSettings()).settings, defaultSettings);
    database.exec("DROP TRIGGER reject_settings");
    await service.saveSettings({ ...defaultSettings, theme: "dark" });
    assert.equal((await service.loadSettings()).settings.theme, "dark");
  } finally { database.close(); }
});

test("迁移写入失败保留 JSON 和空设置表，重试后一次性导入", async (context) => {
  const directory = await temporaryDirectory(context);
  const service = createLoader({ electron: { app: { getPath: () => directory } } })("src/main-process/services/settingsService.ts");
  await service.loadSettings();
  const original = JSON.stringify({ theme: "dark", locale: "zh-CN" });
  await writeFile(path.join(directory, "settings.json"), original);
  const database = new DatabaseSync(path.join(directory, "app.db"));
  try {
    database.exec("CREATE TRIGGER reject_migration BEFORE INSERT ON settings WHEN NEW.key = 'worktreesDirectory' BEGIN SELECT RAISE(ABORT, 'migration failed'); END");
    await assert.rejects(service.loadSettings(), /migration failed/);
    assert.equal(database.prepare("SELECT count(*) AS count FROM settings").get().count, 0);
    assert.equal(await readFile(path.join(directory, "settings.json"), "utf8"), original);
    database.exec("DROP TRIGGER reject_migration");
    assert.equal((await service.loadSettings()).settings.theme, "dark");
  } finally { database.close(); }
});

test("SQLite 文件或字段损坏不回退旧 JSON，也不覆盖原数据", async (context) => {
  const directory = await temporaryDirectory(context);
  const service = createLoader({ electron: { app: { getPath: () => directory } } })("src/main-process/services/settingsService.ts");
  const databasePath = path.join(directory, "app.db");
  await writeFile(path.join(directory, "settings.json"), JSON.stringify({ theme: "light" }));
  await writeFile(databasePath, "damaged database");
  await assert.rejects(service.loadSettings());
  assert.equal(await readFile(databasePath, "utf8"), "damaged database");
  await rm(databasePath);
  await service.saveSettings(defaultSettings);
  const database = new DatabaseSync(databasePath);
  try {
    database.prepare("UPDATE settings SET value = ? WHERE key = ?").run("{invalid", "theme");
    await assert.rejects(service.loadSettings(), /INVALID_SETTINGS/);
    assert.equal(database.prepare("SELECT value FROM settings WHERE key = 'theme'").get().value, "{invalid");
    database.exec("PRAGMA user_version = 2");
    await assert.rejects(service.saveSettings(defaultSettings), /INVALID_SETTINGS/);
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 2);
  } finally { database.close(); }
});

test("诊断日志固定单文件，只包含应用事件和时间，清理不删除其他文件", async (context) => {
  const directory = await temporaryDirectory(context);
  const logDirectory = path.join(directory, "logs");
  await mkdir(logDirectory);
  await writeFile(path.join(logDirectory, "navo-2000-01-01.log"), "old");
  await writeFile(path.join(logDirectory, "keep.txt"), "keep");
  const load = createLoader({ electron: { app: { getPath: () => directory } } });
  const logger = load("src/main-process/services/diagnosticLogService.ts");
  assert.equal(logger.getDiagnosticLogFilePath(), path.join(logDirectory, "navo.log"));
  await logger.writeDiagnosticEvent("app-start");
  const filename = logger.getDiagnosticLogFilePath();
  const content = await readFile(filename, "utf8");
  assert.deepEqual(Object.keys(JSON.parse(content.trim())).sort(), ["event", "time"]);
  await logger.clearDiagnosticLog();
  assert.equal(await readFile(filename, "utf8"), "");
  assert.equal(await readFile(path.join(logDirectory, "keep.txt"), "utf8"), "keep");
  assert.equal(await readFile(path.join(logDirectory, "navo-2000-01-01.log"), "utf8"), "old");
  assert.equal((await logger.getDiagnosticLogStatus()).failed, false);
});

test("诊断日志超过 20 MB 时重置同一文件，不产生额外日志文件", async (context) => {
  const directory = await temporaryDirectory(context);
  const logger = createLoader({ electron: { app: { getPath: () => directory } } })("src/main-process/services/diagnosticLogService.ts");
  await logger.writeDiagnosticEvent("app-start");
  const filename = logger.getDiagnosticLogFilePath();
  await truncate(filename, logger.MAX_DIAGNOSTIC_LOG_BYTES);
  await logger.writeDiagnosticEvent("settings-saved");
  const entries = (await readFile(filename, "utf8")).trim().split("\n").map((entry) => JSON.parse(entry));
  assert.deepEqual(entries.map((entry) => entry.event), ["settings-saved"]);
  assert.ok((await stat(filename)).size <= 20 * 1024 * 1024);
  assert.deepEqual(readdirSync(path.dirname(filename)), ["navo.log"]);
});

test("日志写入和清理串行，清理后继续记录新事件", async (context) => {
  const directory = await temporaryDirectory(context);
  const logger = createLoader({ electron: { app: { getPath: () => directory } } })("src/main-process/services/diagnosticLogService.ts");
  await Promise.all([logger.writeDiagnosticEvent("app-start"), logger.clearDiagnosticLog(), logger.writeDiagnosticEvent("resource-added")]);
  const entries = (await readFile(logger.getDiagnosticLogFilePath(), "utf8")).trim().split("\n").map((entry) => JSON.parse(entry));
  assert.deepEqual(entries.map((entry) => entry.event), ["resource-added"]);
});

test("日志清理失败向调用方报错，修复后允许重试", async (context) => {
  const directory = await temporaryDirectory(context);
  const logger = createLoader({ electron: { app: { getPath: () => directory } } })("src/main-process/services/diagnosticLogService.ts");
  const filename = logger.getDiagnosticLogFilePath();
  await mkdir(filename, { recursive: true });
  await assert.rejects(logger.clearDiagnosticLog(), /EISDIR/);
  assert.equal((await logger.getDiagnosticLogStatus()).failed, true);
  await rm(filename, { recursive: true });
  await logger.clearDiagnosticLog();
  assert.equal(await readFile(filename, "utf8"), "");
  assert.equal((await logger.getDiagnosticLogStatus()).failed, false);
});

test("日志路径校验拒绝目录、非日志文件和已有的其他内容", async (context) => {
  const directory = await temporaryDirectory(context);
  const { validateDiagnosticLogPath } = createLoader()("src/main-process/services/diagnosticLogPath.ts");
  await assert.rejects(validateDiagnosticLogPath(path.join(directory, "source.ts")), /INVALID_LOG_FILE/);
  await assert.rejects(validateDiagnosticLogPath("relative.log"), /INVALID_DIRECTORY/);
  const folder = path.join(directory, "folder.log");
  await mkdir(folder);
  await assert.rejects(validateDiagnosticLogPath(folder), /INVALID_LOG_FILE/);
  const unrelated = path.join(directory, "unrelated.log");
  await writeFile(unrelated, "Do not overwrite");
  await assert.rejects(validateDiagnosticLogPath(unrelated), /LOG_FILE_IN_USE/);
  assert.equal(await readFile(unrelated, "utf8"), "Do not overwrite");
  const empty = path.join(directory, "empty.log");
  await writeFile(empty, "");
  assert.equal(await validateDiagnosticLogPath(empty), empty);
  const newPath = path.join(directory, "nested", "new.log");
  assert.equal(await validateDiagnosticLogPath(newPath), newPath);
});

test("修改日志路径持久化，写入、定位准备及清理均作用于新文件", async (context) => {
  const directory = await temporaryDirectory(context);
  const load = createLoader({ electron: { app: { getPath: () => directory } } });
  const settings = load("src/main-process/services/settingsService.ts");
  const logger = load("src/main-process/services/diagnosticLogService.ts");
  await logger.writeDiagnosticEvent("app-start");
  const originalPath = logger.getDiagnosticLogFilePath();
  const originalContent = await readFile(originalPath, "utf8");
  const customPath = path.join(directory, "custom", "diagnostics.log");
  await settings.saveSettings({ ...defaultSettings, logFilePath: customPath });
  assert.equal(logger.getDiagnosticLogFilePath(), customPath);
  assert.equal(await logger.prepareDiagnosticLogFile(), customPath);
  assert.equal(await readFile(customPath, "utf8"), "");
  await logger.writeDiagnosticEvent("settings-saved");
  const customContent = await readFile(customPath, "utf8");
  assert.equal(JSON.parse(customContent.trim()).event, "settings-saved");
  await logger.prepareDiagnosticLogFile();
  assert.equal(await readFile(customPath, "utf8"), customContent);
  assert.equal((await settings.loadSettings()).settings.logFilePath, customPath);
  await logger.clearDiagnosticLog();
  assert.equal(await readFile(customPath, "utf8"), "");
  assert.equal(await readFile(originalPath, "utf8"), originalContent);
});

test("拒绝已有其他日志文件时，不改变已保存路径或文件内容", async (context) => {
  const directory = await temporaryDirectory(context);
  const load = createLoader({ electron: { app: { getPath: () => directory } } });
  const settings = load("src/main-process/services/settingsService.ts");
  await settings.saveSettings(defaultSettings);
  const unrelated = path.join(directory, "other.log");
  await writeFile(unrelated, "Other application logs");
  await assert.rejects(settings.saveSettings({ ...defaultSettings, logFilePath: unrelated }), /LOG_FILE_IN_USE/);
  assert.equal(settings.getCurrentSettings().logFilePath, "");
  assert.equal(await readFile(unrelated, "utf8"), "Other application logs");
});

test("日志路径使用可取消的目录选择器，保留文件名并支持文件管理器定位", async (context) => {
  const directory = await temporaryDirectory(context);
  const homeDirectory = path.join(directory, "home");
  const handlers = new Map();
  let dialogResult = { canceled: true };
  let dialogOptions;
  let revealedPath;
  const electron = {
    app: { getPath: (name) => name === "home" ? homeDirectory : directory },
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    BrowserWindow: { fromWebContents: () => ({}) },
    dialog: { showOpenDialog: async (_window, options) => { dialogOptions = options; return dialogResult; } },
    shell: { showItemInFolder: (filePath) => { revealedPath = filePath; } },
  };
  const load = createLoader({ electron });
  load("src/main-process/ipc/settingsHandlers.ts").registerSettingsHandlers();
  const { ipcChannels } = load("src/shared/ipcChannels.ts");
  assert.equal(await handlers.get(ipcChannels.settingsChooseDirectory)({ sender: {} }), null);
  assert.equal(dialogOptions.defaultPath, homeDirectory);
  assert.deepEqual(dialogOptions.properties, ["openDirectory", "createDirectory"]);
  const bootstrap = await handlers.get(ipcChannels.settingsLoad)();
  assert.equal(bootstrap.logFilePath, path.join(directory, "logs", "navo.log"));
  assert.equal(await handlers.get(ipcChannels.settingsChooseLogFile)({ sender: {} }), null);
  const chosenDirectory = path.join(directory, "chosen");
  await mkdir(chosenDirectory);
  const chosenPath = path.join(chosenDirectory, "navo.log");
  dialogResult = { canceled: false, filePaths: [chosenDirectory] };
  assert.equal(await handlers.get(ipcChannels.settingsChooseLogFile)({ sender: {} }), chosenPath);
  assert.deepEqual(dialogOptions.properties, ["openDirectory", "createDirectory"]);
  assert.equal(dialogOptions.defaultPath, path.join(directory, "logs"));
  const settings = load("src/main-process/services/settingsService.ts");
  await settings.saveSettings({ ...defaultSettings, logFilePath: chosenPath });
  await handlers.get(ipcChannels.settingsRevealLogFile)();
  assert.equal(revealedPath, chosenPath);
  assert.equal((await stat(chosenPath)).isFile(), true);
  await settings.saveSettings({ ...defaultSettings, logFilePath: path.join(directory, "custom-name.log") });
  assert.equal(await handlers.get(ipcChannels.settingsChooseLogFile)({ sender: {} }), path.join(chosenDirectory, "custom-name.log"));
});

test("迁移失败保留旧配置，重试成功后只使用主进程 SQLite", async () => {
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  const legacy = new Map([["vibe-reviewer-settings", JSON.stringify({ theme: "dark", diffCodeFontSize: 19 })]]);
  const state = { disk: null, fail: true };
  globalThis.localStorage = { getItem: (key) => legacy.get(key) ?? null, removeItem: (key) => legacy.delete(key) };
  globalThis.window = { navo: { settings: {
    load: async () => ({ settings: state.disk, logFilePath: "/logs/navo.log" }),
    save: async (value) => { if (state.fail) throw new Error("EACCES"); state.disk = value; return value; },
  } } };
  try {
    const load = createLoader({ "@/i18n": { __esModule: true, default: { changeLanguage: async () => undefined } } });
    const { useSettingsStore } = load("src/stores/settingsStore.ts");
    await useSettingsStore.getState().bootstrap();
    assert.equal(useSettingsStore.getState().loaded, false);
    assert.ok(legacy.has("vibe-reviewer-settings"));
    state.fail = false;
    await useSettingsStore.getState().bootstrap();
    assert.equal(useSettingsStore.getState().loaded, true);
    assert.equal(useSettingsStore.getState().settings.theme, "dark");
    assert.equal(useSettingsStore.getState().settings.diffCodeFontSize, 19);
    assert.equal(state.disk.locale, "en");
    assert.equal(legacy.size, 0);
    state.fail = true;
    useSettingsStore.getState().update((current) => ({ ...current, theme: "light" }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(useSettingsStore.getState().settings.theme, "light");
    assert.ok(useSettingsStore.getState().saveError);
    assert.equal(state.disk.theme, "dark");
    state.fail = false;
    useSettingsStore.getState().retrySave();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(state.disk.theme, "light");
    assert.equal(useSettingsStore.getState().saveError, null);
  } finally { globalThis.window = originalWindow; globalThis.localStorage = originalStorage; }
});

test("翻译覆盖所有静态 UI 文案并保留动态占位符", () => {
  const { english } = load("src/i18n/translations.ts");
  for (const [key, value] of Object.entries(english)) {
    assert.ok(value.trim());
    const placeholders = (text) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(placeholders(key), placeholders(value), key);
  }
  assert.equal(english["外观"], "Appearance");
  assert.equal(english["重置"], "Reset");
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { inspect(file); continue; }
      if (!file.endsWith(".tsx")) continue;
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        if (ts.isJsxText(node)) assert.ok(!/\p{Script=Han}/u.test(node.text), "Untranslated JSX text in " + file);
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["t", "translate"].includes(node.expression.text)) {
          const key = node.arguments[0];
          if (key && ts.isStringLiteral(key) && /\p{Script=Han}/u.test(key.text)) assert.ok(key.text in english, "Missing translation: " + key.text);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  inspect("src/components");
});

test("语言切换即刻翻译文案和日期，插值不改变任务内容", async () => {
  const module = createLoader()("src/i18n/index.ts");
  const title = "自定义任务名称";
  assert.equal(module.default.language, "en");
  assert.equal(module.t("查看任务：{{title}}", { title }), "View task: " + title);
  assert.match(module.formatDate("2026-09-30"), /Sep/);
  await module.default.changeLanguage("zh-CN");
  assert.equal(module.t("外观"), "外观");
  assert.equal(module.t("查看任务：{{title}}", { title }), "查看任务：" + title);
  assert.match(module.formatDate("2026-09-30"), /年/);
});
