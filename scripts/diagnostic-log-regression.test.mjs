import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

test("诊断事件从单一清单生成，所有已声明事件可写入，未知事件被拒绝", () => {
  const load = createLoader();
  const { DIAGNOSTIC_OPERATIONS, DIAGNOSTIC_RESULTS, DIAGNOSTIC_STANDALONE_EVENTS, isDiagnosticEvent } = load("src/shared/diagnosticTypes.ts");
  const { makeDiagnosticEntry } = load("src/main-process/diagnostics/diagnosticSanitizer.ts");
  const events = [...DIAGNOSTIC_STANDALONE_EVENTS, ...DIAGNOSTIC_OPERATIONS.flatMap((operation) => DIAGNOSTIC_RESULTS.map((result) => operation + "." + result))];
  assert.equal(events.length, new Set(events).size);
  for (const event of events) {
    assert.equal(isDiagnosticEvent(event), true, event);
    assert.equal(makeDiagnosticEntry(event)?.event, event);
  }
  for (const event of [null, undefined, {}, "unknown", "app.missing", "task.create.missing"]) {
    assert.equal(isDiagnosticEvent(event), false);
    assert.equal(makeDiagnosticEntry(event), null);
  }
});

const execute = promisify(execFile);
async function fixture(context, mocks = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-diagnostics-"));
  const load = createLoader(mocks);
  const logger = load("src/main-process/diagnostics/diagnosticLogger.ts");
  let filename = path.join(directory, "navo.log");
  logger.diagnosticWriter.configure(() => filename);
  context.after(async () => { await logger.diagnosticWriter.flush(); await rm(directory, { recursive: true, force: true }); });
  const entries = async () => { await logger.diagnosticWriter.flush(); return (await readFile(filename, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse); };
  return { directory, load, logger, entries, filename, setPath: (value) => { filename = value; } };
}

test("白名单排除业务内容、路径、凭证、命令输出，保留错误码和受限堆栈", async (context) => {
  const { logger, entries, filename } = await fixture(context);
  const secret = "DO_NOT_LOG_SECRET";
  const error = new Error("Command failed: git clone https://user:" + secret + "@host/" + secret);
  error.code = 128;
  error.stdout = secret; error.stderr = secret;
  error.stack = error.message + "\n    at " + secret + " (/Users/private/" + secret + ".ts:22:7)\n    at run (https://host/" + secret + "?token=" + secret + ":10:4)";
  await logger.writeDiagnosticEvent("task.create.failed", {
    taskId: randomUUID(), resourceId: "/Users/" + secret, error,
    title: secret, description: secret, url: secret, path: secret, authorization: secret, stdout: secret,
    changedFields: ["theme", "logFilePath", secret], count: Infinity, status: secret, reason: secret,
  });
  const [entry] = await entries();
  assert.equal(entry.level, "ERROR");
  assert.equal(entry.error.code, "COMMAND_FAILED");
  assert.equal(entry.data.exitCode, 128);
  assert.deepEqual(entry.data.changedFields, ["theme", "logFilePath"]);
  assert.ok(entry.error.stack[0].includes("22:7"));
  assert.doesNotMatch(await readFile(filename, "utf8"), new RegExp(secret + "|/Users/|https://|git clone|authorization|stdout"));
  for (const line of (await readFile(filename, "utf8")).split("\n")) assert.ok(Buffer.byteLength(line) <= 8192);
});

test("操作开始结果耗时可关联，嵌套步骤共享 ID，并发操作不串用上下文", async (context) => {
  const { logger, entries } = await fixture(context);
  const taskIds = [randomUUID(), randomUUID()];
  await Promise.all(taskIds.map((taskId) => logger.diagnosticOperation("task.create", { taskId }, async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await logger.diagnosticOperation("worktree.create", { resourceId: randomUUID() }, async () => 1, { started: true });
    return taskId;
  }, { started: true })));
  const records = await entries();
  for (const taskId of taskIds) {
    const selected = records.filter((record) => record.data.taskId === taskId);
    assert.equal(selected.length, 4);
    assert.equal(new Set(selected.map((record) => record.data.operationId)).size, 1);
    assert.equal(selected[0].event, "task.create.started");
    assert.equal(selected.at(-1).event, "task.create.succeeded");
    assert.equal(typeof selected.at(-1).data.durationMs, "number");
  }
  assert.equal(new Set(records.map((record) => record.data.operationId)).size, 2);
});

test("初始会话达到容量上限时保留可诊断的错误码", async (context) => {
  const { logger, entries } = await fixture(context);
  await logger.writeDiagnosticEvent("session.start.failed", { taskId: randomUUID(), error: new Error("SESSION_LIMIT") });
  const [entry] = await entries();
  assert.equal(entry.error.code, "SESSION_LIMIT");
  assert.equal(entry.level, "ERROR");
});

test("笔记版本冲突及会话保护失败保留稳定错误码，不泄露附加数据", async (context) => {
  const { load, logger, entries } = await fixture(context);
  const { TaskNoteVersionConflict } = load("src/main-process/services/taskNoteRepository.ts");
  const failures = [
    ["task.note.update", new TaskNoteVersionConflict(3)],
    ["session.start", new Error("SESSION_BUSY")],
    ["session.start", new Error("SESSION_INITIALIZATION_REQUIRED")],
    ["task.note.update", new Error("SESSION_CONTEXT_UNAVAILABLE")],
    ["session.start", new Error("SESSION_CONTEXT_FILE_CHANGED")],
    ["session.start", new Error("AGENT_SECURE_STORAGE")],
  ];
  for (const [operation, error] of failures) {
    error.secret = "PRIVATE_NOTE_BODY";
    await assert.rejects(logger.diagnosticOperation(operation, {}, async () => { throw error; }), { message: error.message });
  }
  const records = await entries();
  assert.deepEqual(records.map((entry) => entry.error.code), failures.map(([, error]) => error.message));
  assert.doesNotMatch(JSON.stringify(records), /PRIVATE_NOTE_BODY|currentVersion/);
});

test("可恢复保护为 WARN，取消为 INFO；同一异常堆栈只记录一次", async (context) => {
  const { logger, entries } = await fixture(context);
  const error = new Error("TASK_DELETE_CHANGED");
  await assert.rejects(logger.diagnosticOperation("task.delete", {}, () => logger.diagnosticOperation("worktree.delete", {}, async () => { throw error; })), /TASK_DELETE_CHANGED/);
  await assert.rejects(logger.diagnosticOperation("resource.clone", {}, async () => { throw new Error("CLONE_CANCELLED"); }), /CLONE_CANCELLED/);
  const records = await entries();
  assert.equal(records.filter((entry) => entry.error?.stack?.length).length, 1);
  assert.equal(records.find((entry) => entry.event === "task.delete.failed").level, "WARN");
  assert.equal(records.find((entry) => entry.event === "resource.clone.cancelled").level, "INFO");
});

test("重复异常汇总计数，清理后不回填旧汇总", async (context) => {
  const { logger, entries, filename } = await fixture(context);
  for (let index = 0; index < 8; index += 1) await logger.writeDiagnosticEvent("app.watcher_failed", { error: new Error("EACCES") });
  const records = await entries();
  assert.equal(records.filter((entry) => entry.event === "app.watcher_failed").length, 1);
  assert.equal(records.find((entry) => entry.event === "log.repeated").data.count, 7);
  await logger.writeDiagnosticEvent("app.watcher_failed", { error: new Error("EACCES") });
  await logger.writeDiagnosticEvent("app.watcher_failed", { error: new Error("EACCES") });
  await logger.diagnosticWriter.clear(filename);
  await logger.diagnosticWriter.flush();
  assert.equal(await readFile(filename, "utf8"), "");
  await logger.writeDiagnosticEvent("app.started");
  assert.deepEqual((await entries()).map((entry) => entry.event), ["app.started"]);
});

test("未启用写盘时缓冲有界，队列拥塞优先保留错误并记录丢弃数量", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-log-queue-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const load = createLoader();
  const { DiagnosticWriter } = load("src/main-process/diagnostics/diagnosticWriter.ts");
  const { makeDiagnosticEntry } = load("src/main-process/diagnostics/diagnosticSanitizer.ts");
  const writer = new DiagnosticWriter();
  for (let index = 0; index < 1200; index += 1) void writer.write(makeDiagnosticEntry("task.rename.succeeded", { taskId: randomUUID() }));
  for (let index = 0; index < 150; index += 1) void writer.write(makeDiagnosticEntry("task.create.failed", { taskId: randomUUID(), error: new Error("ENOSPC") }));
  const filename = path.join(directory, "navo.log");
  writer.configure(() => filename);
  await writer.flush();
  const records = (await readFile(filename, "utf8")).trim().split("\n").map(JSON.parse);
  assert.ok(records.length <= 1002);
  assert.equal(records.filter((entry) => entry.level === "ERROR").length, 150);
  assert.ok(records.filter((entry) => entry.event === "log.dropped").reduce((total, entry) => total + entry.data.count, 0) >= 300);
});

test("日志不可写不影响业务结果或原始异常，修复后恢复且失败状态可见", async (context) => {
  const { logger, directory, filename } = await fixture(context);
  await mkdir(filename);
  assert.equal(await logger.diagnosticOperation("task.rename", {}, async () => 42), 42);
  await logger.diagnosticWriter.flush();
  assert.equal((await logger.diagnosticWriter.status()).failed, true);
  const original = new Error("TASK_INVALID");
  await assert.rejects(logger.diagnosticOperation("task.create", {}, async () => { throw original; }), (error) => error === original);
  await logger.diagnosticWriter.flush();
  await rm(filename, { recursive: true });
  await logger.writeDiagnosticEvent("app.started");
  assert.equal((await logger.diagnosticWriter.status()).failed, false);
  assert.ok((await readFile(path.join(directory, "navo.log"), "utf8")).includes("app.started"));
});

test("旧格式与新格式混合兼容，8KB 内的合法首行可校验且无关文件不被覆盖", async (context) => {
  const { logger, load, filename } = await fixture(context);
  const { validateDiagnosticLogPath } = load("src/main-process/services/diagnosticLogPath.ts");
  const legacy = JSON.stringify({ time: new Date().toISOString(), event: "app-start" }) + "\n";
  await writeFile(filename, legacy);
  await logger.writeDiagnosticEvent("app.started");
  assert.ok((await readFile(filename, "utf8")).startsWith(legacy));
  assert.equal(await validateDiagnosticLogPath(filename), filename);
  await logger.diagnosticWriter.clear(filename);
  const first = JSON.stringify({ schemaVersion: 1, time: new Date().toISOString(), level: "INFO", scope: "app", event: "app.started", data: {} });
  await writeFile(filename, first.slice(0, -1) + " ".repeat(5000) + "}\n");
  assert.equal(await validateDiagnosticLogPath(filename), filename);
  await writeFile(filename, "another application's log");
  await logger.writeDiagnosticEvent("app.started");
  assert.equal((await logger.diagnosticWriter.status()).failed, true);
  assert.equal(await readFile(filename, "utf8"), "another application's log");
});

test("路径修改不移动旧文件，事件写到入队时的路径", async (context) => {
  const { logger, directory, filename, setPath } = await fixture(context);
  const first = logger.writeDiagnosticEvent("app.started");
  const next = path.join(directory, "other.log");
  setPath(next);
  const second = logger.writeDiagnosticEvent("settings.save.succeeded", { changedFields: ["logFilePath"] });
  await Promise.all([first, second]);
  assert.equal(JSON.parse((await readFile(filename, "utf8")).trim()).event, "app.started");
  assert.equal(JSON.parse((await readFile(next, "utf8")).trim()).event, "settings.save.succeeded");
});

test("真实任务失败和 Worktree 创建/删除可追踪，任务标题与描述不进入日志", async (context) => {
  const { directory, load, logger, entries, filename } = await fixture(context, { electron: { nativeImage: { createFromPath: () => ({ isEmpty: () => true }) } } });
  const { TaskService } = load("src/main-process/services/taskService.ts");
  const { ResourceService } = load("src/main-process/services/resourceService.ts");
  const { defaultSettings } = load("src/domain/settings.ts");
  const repo = path.join(directory, "private-project");
  await mkdir(repo);
  const git = (...args) => execute("git", args, { cwd: repo, env: { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: "1" } });
  await git("init", "-b", "main");
  await git("config", "user.email", "test@example.invalid"); await git("config", "user.name", "Test");
  await git("config", "core.hooksPath", os.devNull);
  await writeFile(path.join(repo, "private-code.txt"), "PRIVATE_CODE");
  await git("add", "."); await git("commit", "-m", "PRIVATE_COMMIT_MESSAGE");
  const resource = await new ResourceService(path.join(directory, "resources.json")).save({ kind: "repo", name: "PRIVATE_PROJECT", localPath: repo });
  const settings = { ...defaultSettings, worktreesDirectory: path.join(directory, "worktrees") };
  const service = new TaskService(directory, "production", () => settings);
  const task = await service.create({
    requestId: randomUUID(), description: "PRIVATE_TITLE\nPRIVATE_DESCRIPTION",
    resources: [{ resourceId: resource.id, mode: "worktree", sourceBranch: "refs/heads/main", targetBranch: "" }], links: [], attachmentIds: [],
  }, 1);
  const preview = await service.inspectDeletion(task.id, { deleteWorktrees: true, deleteBranches: true }, 1);
  await service.remove(task.id, { token: preview.token }, 1);
  const records = await entries();
  for (const event of ["task.create.started", "task.create.succeeded", "worktree.create.succeeded", "task.delete.started", "worktree.delete.succeeded", "branch.delete.succeeded", "task.delete.succeeded"]) {
    assert.ok(records.some((entry) => entry.event === event), event);
  }
  const deletion = records.filter((entry) => entry.data.taskId === task.id && /delete/.test(entry.event));
  assert.equal(new Set(deletion.map((entry) => entry.data.operationId)).size, 1);
  assert.doesNotMatch(await readFile(filename, "utf8"), /PRIVATE_|private-project|private-code|worktrees\//);
  await assert.rejects(service.remove(task.id), /TASK_NOT_FOUND/);
  assert.ok((await entries()).some((entry) => entry.event === "task.delete.failed" && entry.error.code === "TASK_NOT_FOUND"));
  await logger.diagnosticWriter.flush();
});

test("渲染异常 IPC 限制类别和频率，不接受任意正文或子 frame 上报", async (context) => {
  const handlers = new Map();
  const { load, entries, filename } = await fixture(context, { electron: { ipcMain: { handle: (name, handler) => handlers.set(name, handler) } } });
  const runtime = load("src/main-process/diagnostics/diagnosticRuntime.ts");
  runtime.registerDiagnosticHandlers();
  const sender = Object.assign(new EventEmitter(), { id: 5, mainFrame: {} });
  const handler = handlers.get("diagnostics:report");
  const event = { sender, senderFrame: sender.mainFrame };
  handler({ ...event, senderFrame: {} }, { kind: "error", name: "Error" });
  handler(event, { kind: "arbitrary-event", name: "Error", message: "SECRET" });
  for (let index = 0; index < 50; index += 1) handler(event, { kind: "react-error", name: "TypeError", stack: "SECRET\n at SECRET (/Users/SECRET:3:4)", message: "SECRET", path: "SECRET" });
  const records = await entries();
  assert.equal(records.filter((entry) => entry.event === "renderer.react_error").length, 1);
  assert.equal(records.find((entry) => entry.event === "log.repeated").data.count, 29);
  assert.doesNotMatch(await readFile(filename, "utf8"), /SECRET|arbitrary-event/);
  sender.emit("destroyed");
});

test("致命异常监控尽力同步写入且不阻止默认退出，包括未处理 Promise 拒绝", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-fatal-log-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  for (const rejection of [false, true]) {
    const filename = path.join(directory, rejection ? "rejection.log" : "exception.log");
    const script = `
      import { createLoader } from "./scripts/helpers/load-typescript.mjs";
      const { diagnosticWriter, writeFatalDiagnostic } = createLoader()("src/main-process/diagnostics/diagnosticLogger.ts");
      diagnosticWriter.configure(() => ${JSON.stringify(filename)});
      process.on("uncaughtExceptionMonitor", writeFatalDiagnostic);
      ${rejection ? 'Promise.reject(new Error("PRIVATE_FATAL_MESSAGE"));' : 'setImmediate(() => { throw new Error("PRIVATE_FATAL_MESSAGE"); });'}
    `;
    const result = await execute(process.execPath, ["--unhandled-rejections=throw", "--input-type=module", "-e", script]).catch((error) => error);
    assert.notEqual(result.code, 0);
    const content = await readFile(filename, "utf8");
    assert.equal(JSON.parse(content.trim()).event, rejection ? "app.unhandled_rejection" : "app.uncaught");
    assert.doesNotMatch(content, /PRIVATE_FATAL_MESSAGE/);
  }
});
