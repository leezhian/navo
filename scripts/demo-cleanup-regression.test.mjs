import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import ts from "typescript";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { isLegacyDemoTask, isLegacyDemoIssue } = load("src/shared/legacyDemoRecords.ts");
const { openAppDatabase } = load("src/main-process/services/appDatabase.ts");
const { removeLegacyDemoRecords } = load("src/main-process/services/migrations/removeLegacyDemoRecords.ts");
const demoTask = { id: "task-01", title: "设计任务与工作区的组织方式", date: "2026-09-30", projectName: "navo", status: "TODO" };
const demoIssue = { id: "issue-01", title: "支持跨项目任务共享上下文", date: "2026-09-30", projectName: "navo", group: "ISSUE", tag: "feature", status: "progress", provider: "GitHub", repository: "demo/navo" };

function dataService(development, entries = []) {
  const storage = new Map(entries);
  const original = readFileSync("src/services/adeData.ts", "utf8").replaceAll("import.meta.env.DEV", String(development));
  const { outputText } = ts.transpileModule(original, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const module = { exports: {} };
  const localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  new Function("require", "module", "exports", "localStorage", outputText)((name) => load("src/" + name.slice(2) + ".ts"), module, module.exports, localStorage);
  return { ...module.exports, storage };
}

test("开发与正式环境都从空数据开始，不再自动播种任务或 Issue", () => {
  for (const development of [true, false]) {
    const service = dataService(development);
    assert.deepEqual(service.readLegacyTasks(), []);
    assert.deepEqual(service.loadIssueItems(), []);
    assert.equal(service.storage.size, 0);
  }
  assert.ok(!readFileSync("src/services/adeData.ts", "utf8").includes("adeDevelopmentData"));
});

test("清理旧 localStorage 中的精确 demo，保留真实记录、改名记录和损坏任务报错", () => {
  const realTask = { ...demoTask, id: randomUUID() };
  const renamed = { ...demoTask, title: "用户重命名的任务" };
  const realIssue = { ...demoIssue, id: "github-real-1" };
  const service = dataService(true, [
    ["navo:development:tasks", JSON.stringify([demoTask, realTask])],
    ["navo:development:issues", JSON.stringify([demoIssue, realIssue])],
  ]);
  assert.deepEqual(service.readLegacyTasks(), [realTask]);
  assert.deepEqual(service.loadIssueItems(), [realIssue]);
  assert.deepEqual(JSON.parse(service.storage.get("navo:development:issues")), [realIssue]);
  assert.equal(isLegacyDemoTask(renamed), false);
  assert.equal(isLegacyDemoTask({ ...demoTask, description: "真实描述" }), false);
  assert.equal(isLegacyDemoTask({ ...demoTask, resources: [{ resourceId: "real" }] }), false);
  assert.equal(isLegacyDemoIssue({ ...demoIssue, provider: "GitLab" }), false);
  assert.equal(isLegacyDemoIssue({ ...demoIssue, repository: "real/team" }), false);
  const broken = dataService(false, [["navo:tasks", "{broken"]]);
  assert.throws(() => broken.readLegacyTasks(), /TASK_LEGACY_INVALID/);
});

test("SQLite v4 清理只移除确认的 demo 和假关联，不触碰设置、真实任务和上下文", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-demo-cleanup-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "app.db");
  let database = await openAppDatabase(filename);
  const insertTask = (namespace, task) => database.prepare("INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?)")
    .run(namespace, task.id, task.title, task.description ?? "", task.date, task.projectName, task.status, null, 0);
  database.prepare("INSERT INTO settings VALUES (?,?)").run("theme", '"dark"');
  database.prepare("INSERT INTO task_state VALUES (?,1)").run("development");
  insertTask("development", demoTask);
  insertTask("production", { ...demoTask, title: "用户更改的标题" });
  insertTask("protected", demoTask);
  database.prepare("INSERT INTO task_resources VALUES (?,?,?,?)").run("protected", demoTask.id, 0, JSON.stringify({ resourceId: "real-resource", name: "real", workingPath: "/real" }));
  const real = { ...demoTask, id: randomUUID(), description: "用户真实描述" };
  insertTask("development", real);
  database.prepare("INSERT INTO task_links VALUES (?,?,?,?)").run("development", real.id, demoIssue.id, JSON.stringify(demoIssue));
  database.prepare("INSERT INTO task_links VALUES (?,?,?,?)").run("development", real.id, "real-issue", JSON.stringify({ ...demoIssue, id: "real-issue" }));
  database.exec("PRAGMA user_version = 4"); database.close();
  database = await openAppDatabase(filename);
  assert.equal(database.prepare("PRAGMA user_version").get().user_version, 10);
  assert.equal(database.prepare("SELECT 1 FROM tasks WHERE namespace='development' AND id=?").get(demoTask.id), undefined);
  assert.equal(database.prepare("SELECT description FROM tasks WHERE id=?").get(real.id).description, real.description);
  assert.ok(database.prepare("SELECT 1 FROM tasks WHERE namespace='protected'").get());
  assert.ok(database.prepare("SELECT 1 FROM tasks WHERE namespace='production'").get());
  assert.equal(database.prepare("SELECT count(*) AS count FROM task_links").get().count, 1);
  assert.equal(database.prepare("SELECT value FROM settings WHERE key='theme'").get().value, '"dark"');
  assert.ok(database.prepare("SELECT 1 FROM task_state WHERE namespace='development'").get());
  database.exec("BEGIN IMMEDIATE");
  assert.deepEqual(removeLegacyDemoRecords(database), { removedTasks: 0, removedLinks: 0 });
  database.exec("COMMIT"); database.close();
});

test("清理工具兼容旧 v2 表结构，不升级本机运行中应用的数据版本", () => {
  const database = new DatabaseSync(":memory:");
  database.exec("CREATE TABLE tasks(namespace TEXT,id TEXT,title TEXT,date TEXT,project_name TEXT,description TEXT); PRAGMA user_version=2");
  database.prepare("INSERT INTO tasks VALUES (?,?,?,?,?,?)").run("development", demoTask.id, demoTask.title, demoTask.date, demoTask.projectName, "");
  database.exec("BEGIN");
  assert.deepEqual(removeLegacyDemoRecords(database), { removedTasks: 1, removedLinks: 0 });
  database.exec("COMMIT");
  assert.equal(database.prepare("PRAGMA user_version").get().user_version, 2);
  database.close();
});
