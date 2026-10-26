import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile, rm, access, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = { exports: {} };
  cache.set(absolute, module);
  const { outputText } = ts.transpileModule(readFileSync(absolute, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const localRequire = (name) => {
    if (name === "electron") return { nativeImage: { createFromPath: () => ({ isEmpty: () => true }) } };
    if (name.startsWith(".")) return load(path.resolve(path.dirname(absolute), name) + ".ts");
    if (name.startsWith("@/")) return load("src/" + name.slice(2) + ".ts");
    return require(name);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}
const { TaskService } = load("src/main-process/services/taskService.ts");
const { ResourceService } = load("src/main-process/services/resourceService.ts");
const { defaultSettings } = load("src/domain/settings.ts");
const { prepareWorkspace, createWorkspace, createWorkspaceDirectory } = load("src/main-process/services/taskWorkspaces.ts");
const { openAppDatabase } = load("src/main-process/services/appDatabase.ts");
const execute = promisify(execFile);
async function git(cwd, ...args) {
  return (await execute("git", args, { cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: os.devNull } })).stdout.trim();
}
async function setup(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-task-create-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const settings = { ...defaultSettings, worktreesDirectory: path.join(directory, "worktrees") };
  const service = new TaskService(directory, "production", () => settings);
  const resources = new ResourceService(path.join(directory, "resources.json"));
  async function repo(name) {
    const cwd = path.join(directory, name);
    await mkdir(cwd);
    await git(cwd, "init", "-b", "main");
    await git(cwd, "config", "user.email", "test@example.invalid");
    await git(cwd, "config", "user.name", "Navo test");
    await git(cwd, "config", "core.hooksPath", os.devNull);
    await writeFile(path.join(cwd, "sample.txt"), "original\n");
    await git(cwd, "add", "sample.txt");
    await git(cwd, "commit", "-m", "initial");
    await git(cwd, "update-ref", "refs/remotes/origin/main", "HEAD");
    await git(cwd, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    return resources.save({ kind: "folder", name, localPath: cwd });
  }
  async function inputFor(records, modes = []) {
    const inputs = await Promise.all(records.map(async (record, index) => {
      const info = await service.inspectResource(record.id);
      return { resourceId: record.id, mode: info.git ? modes[index] ?? "worktree" : "folder", sourceBranch: info.git?.defaultSource ?? "", targetBranch: "" };
    }));
    return { requestId: randomUUID(), description: "任务标题\n具体任务描述", resources: inputs, links: [], attachmentIds: [] };
  }
  return { directory, settings, service, resources, repo, inputFor };
}

test("数据库从设置 v1 升级，任务迁移一次且开发与正式数据隔离", async (context) => {
  const { directory, service, settings } = await setup(context);
  const database = new DatabaseSync(path.join(directory, "app.db"));
  database.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version = 1");
  database.prepare("INSERT INTO settings VALUES (?,?)").run("theme", '"dark"');
  database.close();
  assert.equal((await service.load()).tasks, null);
  const legacy = [{ id: "legacy", title: "已有任务", projectName: "project", date: "2026-09-30", status: "DONE" }];
  await service.importLegacy(legacy);
  await service.importLegacy([]);
  assert.equal((await service.load()).tasks[0].id, "legacy");
  const dev = new TaskService(directory, "development", () => settings);
  assert.equal((await dev.load()).tasks, null);
  await dev.importLegacy([]);
  assert.deepEqual((await dev.load()).tasks, []);
  const upgraded = await openAppDatabase(path.join(directory, "app.db"));
  assert.equal(upgraded.prepare("SELECT value FROM settings WHERE key='theme'").get().value, '"dark"');
  assert.equal(upgraded.prepare("PRAGMA user_version").get().user_version, 11);
  upgraded.close();
});

test("任务 Agent 配置独立持久化、提交前验证、旧任务兼容与幂等重试", async (context) => {
  const { directory, settings, inputFor, service } = await setup(context);
  const legacy = await service.create(await inputFor([]), 1);
  const database = new DatabaseSync(path.join(directory, "app.db"));
  database.exec("DROP TABLE task_agents; PRAGMA user_version = 6"); database.close();
  let validations = 0;
  const agent = { agentId: "claude", modelId: "runtime-model", modelName: "Runtime model", modeId: "plan", modeName: "Plan", effort: "high" };
  const validating = new TaskService(directory, "production", () => settings, async (selection) => { validations += 1; return { ...selection, modelName: "Verified model" }; });
  const input = { ...await inputFor([]), agent };
  const created = await validating.create(input, 1);
  assert.equal(created.agent.modelName, "Verified model");
  assert.deepEqual((await new TaskService(directory, "production", () => settings).load()).tasks.find((task) => task.id === created.id).agent, created.agent);
  assert.equal((await validating.load()).tasks.find((task) => task.id === legacy.id).agent, undefined);
  await validating.create(input, 1); assert.equal(validations, 1);
  await assert.rejects(validating.create({ ...input, requestId: randomUUID(), agent: { ...agent, effort: {} } }, 1), /TASK_INVALID/);
  const refusing = new TaskService(directory, "production", () => settings, async () => { throw new Error("TASK_AGENT_UNAVAILABLE"); });
  await assert.rejects(refusing.create({ ...input, requestId: randomUUID() }, 1), /TASK_AGENT_UNAVAILABLE/);
  assert.equal((await refusing.repository.operations()).length, 0);
  assert.equal((await refusing.load()).tasks.length, 2);
  await validating.repository.update((tasks) => tasks.filter((task) => task.id !== created.id));
  const reopened = new DatabaseSync(path.join(directory, "app.db"));
  assert.equal(reopened.prepare("SELECT COUNT(*) AS count FROM task_agents").get().count, 0); reopened.close();
});

test("普通链接独立保存、重启恢复，旧 v2 数据升级不受影响", async (context) => {
  const { directory, settings, service, inputFor } = await setup(context);
  const existing = await service.create(await inputFor([]), 1);
  const database = new DatabaseSync(path.join(directory, "app.db"));
  database.exec("DROP TABLE task_web_links; PRAGMA user_version = 2");
  database.close();
  const input = await inputFor([]);
  input.webLinks = [
    { id: randomUUID(), url: "https://example.com/spec?version=1#intro", title: "  需求规范  " },
    { id: randomUUID(), url: "https://example.com/ticket", title: "" },
  ];
  const task = await service.create(input, 1);
  assert.equal(task.webLinks[0].title, "需求规范");
  assert.equal(task.webLinks[1].title, "");
  assert.deepEqual(task.links, []);
  const restarted = new TaskService(directory, "production", () => settings);
  assert.deepEqual((await restarted.load()).tasks.find((item) => item.id === task.id).webLinks, task.webLinks);
  assert.deepEqual((await restarted.load()).tasks.find((item) => item.id === existing.id).webLinks, []);
  await restarted.rename(task.id, "新标题");
  await restarted.move(task.id, "DONE", null);
  assert.deepEqual((await restarted.load()).tasks.find((item) => item.id === task.id).webLinks, task.webLinks);
  const dev = new TaskService(directory, "development", () => settings);
  assert.equal((await dev.load()).tasks, null);
  await restarted.remove(task.id);
  const check = await openAppDatabase(path.join(directory, "app.db"));
  assert.equal(check.prepare("SELECT count(*) AS count FROM task_web_links").get().count, 0);
  check.close();
});

test("主进程拒绝无效普通链接，不创建任务或工作区", async (context) => {
  const { service, inputFor } = await setup(context);
  const input = await inputFor([]);
  const valid = { id: randomUUID(), url: "https://example.com", title: "" };
  for (const webLinks of [
    null, {}, [null], [{ ...valid, url: "" }], [{ ...valid, url: "example.com" }],
    [{ ...valid, url: "javascript:alert(1)" }], [{ ...valid, url: "file:///etc/passwd" }],
    [{ ...valid, url: "https://user:password@example.com" }], [{ ...valid, url: "https://example.com/" + "a".repeat(8192) }],
    [{ ...valid, title: "a".repeat(201) }], [{ ...valid, id: "" }], [valid, valid],
  ]) await assert.rejects(service.create({ ...input, webLinks }, 1), /TASK_INVALID/);
  assert.equal((await service.load()).tasks, null);
});

test("多仓库创建 Worktree、远程默认分支和短随机目标名，重试不重复创建", async (context) => {
  const { repo, service, inputFor } = await setup(context);
  const records = [await repo("repo-a"), await repo("repo-b")];
  const info = await service.inspectResource(records[0].id);
  assert.ok(info.git);
  assert.equal(info.git.defaultSource, "refs/remotes/origin/main");
  assert.deepEqual(new Set(info.git.branches.map((branch) => branch.kind)), new Set(["local", "remote"]));
  const input = await inputFor(records);
  const task = await service.create(input, 1);
  assert.equal(task.title, "任务标题");
  assert.equal(task.description, input.description);
  assert.equal(task.status, "TODO");
  assert.equal(task.resources.length, 2);
  for (const resource of task.resources) {
    assert.match(resource.targetBranch, /^navo\/[a-f0-9]{8}$/);
    assert.equal(await git(resource.workingPath, "branch", "--show-current"), resource.targetBranch);
    assert.equal(await git(resource.originalPath, "branch", "--show-current"), "main");
  }
  assert.equal((await service.create(input, 1)).id, task.id);
  assert.equal((await service.load()).tasks.length, 1);
  await service.remove(task.id);
  for (const resource of task.resources) await access(resource.workingPath);
});

test("同名本地和远程分支始终选择远程完整引用，任务基线不会错位", async (context) => {
  const { repo, service, inputFor } = await setup(context);
  const record = await repo("repo");
  const remoteCommit = await git(record.localPath, "rev-parse", "refs/remotes/origin/main");
  await writeFile(path.join(record.localPath, "sample.txt"), "local change\n");
  await git(record.localPath, "commit", "-am", "local change");
  await git(record.localPath, "branch", "origin/main");
  assert.notEqual(await git(record.localPath, "rev-parse", "refs/heads/origin/main"), remoteCommit);
  assert.equal((await service.inspectResource(record.id)).git.defaultSource, "refs/remotes/origin/main");
  const task = await service.create(await inputFor([record]), 1);
  assert.equal(await git(task.resources[0].workingPath, "rev-parse", "HEAD"), remoteCommit);
  await git(record.localPath, "update-ref", "refs/remotes/origin/release", remoteCommit);
  await git(record.localPath, "branch", "origin/release");
  await git(record.localPath, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/release");
  assert.equal((await service.inspectResource(record.id)).git.defaultSource, "refs/remotes/origin/release");
});

test("没有远程默认引用时按远程主分支、本地主分支、当前分支回退，并排除同名标签歧义", async (context) => {
  const { repo, service, inputFor } = await setup(context);
  const record = await repo("repo");
  await git(record.localPath, "symbolic-ref", "--delete", "refs/remotes/origin/HEAD");
  await git(record.localPath, "branch", "origin/main");
  assert.equal((await service.inspectResource(record.id)).git.defaultSource, "refs/remotes/origin/main");
  await git(record.localPath, "update-ref", "-d", "refs/remotes/origin/main");
  assert.equal((await service.inspectResource(record.id)).git.defaultSource, "refs/heads/main");
  await git(record.localPath, "branch", "-m", "feature/current");
  await git(record.localPath, "tag", "feature/current");
  const info = await service.inspectResource(record.id);
  assert.equal(info.git.defaultSource, "refs/heads/feature/current");
  assert.equal(info.git.currentBranch, "feature/current");
  const task = await service.create(await inputFor([record], ["new-branch"]), 1);
  assert.equal(await git(record.localPath, "symbolic-ref", "HEAD"), "refs/heads/" + task.resources[0].targetBranch);
});

test("显式分支不叠加前缀，空前缀只生成八位短名，冲突或无效名不覆盖", async (context) => {
  const { repo, service, settings, inputFor } = await setup(context);
  const record = await repo("repo");
  const input = await inputFor([record]);
  input.resources[0].targetBranch = "custom-short";
  const task = await service.create(input, 1);
  assert.equal(task.resources[0].targetBranch, "custom-short");
  assert.equal(path.dirname(task.resources[0].workingPath), settings.worktreesDirectory);
  assert.match(path.basename(task.resources[0].workingPath), /^repo-[a-f0-9]{8}$/);
  const duplicate = { ...input, requestId: randomUUID() };
  await assert.rejects(service.create(duplicate, 1), /TASK_BRANCH_EXISTS/);
  duplicate.resources = [{ ...input.resources[0], targetBranch: "../invalid" }];
  await assert.rejects(service.create(duplicate, 1), /TASK_INVALID_BRANCH/);
  settings.branchPrefix = "";
  const automatic = await service.create(await inputFor([record]), 1);
  assert.match(automatic.resources[0].targetBranch, /^[a-f0-9]{8}$/);
  assert.equal(path.basename(automatic.resources[0].workingPath), "repo-" + automatic.resources[0].targetBranch);
});

test("不同任务的 Worktree 均平铺，分支后缀与目录一致，失败不清理共用根目录", async (context) => {
  const { directory, service, settings, repo, inputFor } = await setup(context);
  const record = await repo("repo");
  const first = await service.create(await inputFor([record]), 1);
  const second = await service.create(await inputFor([record]), 1);
  for (const task of [first, second]) {
    const resource = task.resources[0];
    assert.equal(path.dirname(resource.workingPath), settings.worktreesDirectory);
    assert.equal(path.basename(resource.workingPath), "repo-" + resource.targetBranch.slice(-8));
  }
  const before = (await readdir(settings.worktreesDirectory)).sort();
  const database = new DatabaseSync(path.join(directory, "app.db"));
  database.exec("CREATE TRIGGER reject_task BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'save failed'); END");
  try { await assert.rejects(service.create(await inputFor([record]), 1), /save failed/); }
  finally { database.close(); }
  assert.deepEqual((await readdir(settings.worktreesDirectory)).sort(), before);
  assert.deepEqual(await service.repository.operations(), []);
  await access(first.resources[0].workingPath);
  await access(second.resources[0].workingPath);
});

test("Git 创建前中断只回收独占空目录，不删除预留目录中的用户文件", async (context) => {
  const { service, settings, repo, inputFor } = await setup(context);
  const record = await repo("repo");
  const persist = service.repository.recordOperation.bind(service.repository);
  for (const dirty of [false, true]) {
    let reservedPath;
    service.repository.recordOperation = async (id, state, manifest) => {
      await persist(id, state, manifest);
      const step = manifest.steps[0];
      if (state === "pending" && step.directoryReservation && !step.worktreeCreated) {
        reservedPath = step.resource.workingPath;
        if (dirty) await writeFile(path.join(reservedPath, "keep.txt"), "user data");
        throw new Error("reservation interrupted");
      }
    };
    await assert.rejects(service.create(await inputFor([record]), 1), dirty ? /TASK_CREATE_RETAINED/ : /reservation interrupted/);
    if (dirty) assert.equal(await readFile(path.join(reservedPath, "keep.txt"), "utf8"), "user data");
    else {
      await assert.rejects(access(reservedPath));
      assert.deepEqual(await service.repository.operations(), []);
      assert.deepEqual(await readdir(settings.worktreesDirectory), []);
    }
  }
});

test("原目录新建分支拒绝未提交改动，当前分支模式不改动工作区", async (context) => {
  const { repo, service, inputFor } = await setup(context);
  const record = await repo("repo");
  await writeFile(path.join(record.localPath, "sample.txt"), "user change\n");
  await assert.rejects(service.create(await inputFor([record], ["new-branch"]), 1), /TASK_DIRTY_REPOSITORY/);
  const current = await service.create(await inputFor([record], ["current-branch"]), 1);
  assert.equal(current.resources[0].workingPath, record.localPath);
  assert.equal(await git(record.localPath, "branch", "--show-current"), "main");
  assert.equal(await readFile(path.join(record.localPath, "sample.txt"), "utf8"), "user change\n");
  await writeFile(path.join(record.localPath, "sample.txt"), "original\n");
  const next = await service.create(await inputFor([record], ["new-branch"]), 1);
  assert.equal(await git(record.localPath, "branch", "--show-current"), next.resources[0].targetBranch);
});

test("普通目录不执行 Git，附件只接收文件且复制后独立于原文件", async (context) => {
  const { directory, resources, service, inputFor } = await setup(context);
  const folder = path.join(directory, "context");
  await mkdir(folder);
  const record = await resources.save({ kind: "folder", name: "context", localPath: folder });
  const original = path.join(directory, "notes.txt");
  await writeFile(original, "attachment content");
  await assert.rejects(service.files.add(1, [folder]), /TASK_FILES_ONLY/);
  const selected = await service.files.add(1, [original]);
  assert.equal((await service.files.add(1, [original]))[0].id, selected[0].id);
  const input = await inputFor([record]);
  input.attachmentIds = selected.map((file) => file.id);
  await assert.rejects(service.create(input, 2), /TASK_ATTACHMENT_MISSING/);
  const task = await service.create(input, 1);
  assert.equal(task.resources[0].mode, "folder");
  assert.equal(task.attachments[0].name, "notes.txt");
  const copy = path.join(directory, "task-files", "production", task.id, selected[0].id + ".txt");
  await writeFile(original, "changed original");
  assert.equal(await readFile(copy, "utf8"), "attachment content");
  await service.remove(task.id);
  await assert.rejects(access(copy), /ENOENT/);
  assert.equal(await readFile(original, "utf8"), "changed original");
});

test("任务状态、归档前状态、顺序、标题和关联条目可持久化恢复", async (context) => {
  const { service, directory, settings, inputFor } = await setup(context);
  const input = await inputFor([]);
  input.links = [{ id: "pr-1", group: "PR", title: "PR title", tag: "fix", status: "review", projectName: "project", date: "2026-10-03" }];
  const first = await service.create(input, 1);
  const second = await service.create(await inputFor([]), 1);
  assert.equal((await service.load()).tasks[0].id, second.id);
  await service.move(first.id, "DONE", null);
  await service.move(first.id, "ARCHIVED", null);
  assert.equal((await service.load()).tasks.find((task) => task.id === first.id).archivedFrom, "DONE");
  await service.restore(first.id);
  await service.rename(first.id, "重命名");
  const restarted = new TaskService(directory, "production", () => settings);
  const restored = (await restarted.load()).tasks.find((task) => task.id === first.id);
  assert.equal(restored.status, "DONE");
  assert.equal(restored.title, "重命名");
  assert.equal(restored.description, input.description);
  assert.deepEqual(restored.links, input.links);
  await service.remove(first.id);
  await service.remove(second.id);
  assert.deepEqual((await restarted.load()).tasks, []);
});

test("最终数据库写入失败时撤销本次干净 Worktree 和新分支，保留原仓库", async (context) => {
  const { directory, service, repo, inputFor } = await setup(context);
  const record = await repo("repo");
  await service.load();
  const database = new DatabaseSync(path.join(directory, "app.db"));
  database.exec("CREATE TRIGGER reject_task BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'test commit failure'); END");
  const input = await inputFor([record]);
  await assert.rejects(service.create(input, 1), /test commit failure/);
  assert.equal(await git(record.localPath, "branch", "--format=%(refname:short)"), "main");
  assert.equal((await git(record.localPath, "worktree", "list", "--porcelain")).split("worktree ").length, 2);
  assert.deepEqual(await service.repository.operations(), []);
  database.exec("DROP TRIGGER reject_task");
  database.close();
  const retry = await service.create(input, 1);
  assert.equal(retry.id, input.requestId);
});

test("多仓库中途失败不删除碰撞目录，其他本次创建内容可回滚并记录保留提示", async (context) => {
  const { service, repo, inputFor } = await setup(context);
  const input = await inputFor([await repo("first"), await repo("second")]);
  const originalPersist = service.repository.recordOperation.bind(service.repository);
  let collisionPath;
  service.repository.recordOperation = async (id, state, manifest) => {
    await originalPersist(id, state, manifest);
    if (manifest.steps[0].worktreeCreated && !collisionPath) {
      collisionPath = manifest.steps[1].resource.workingPath;
      await mkdir(collisionPath);
      await writeFile(path.join(collisionPath, "keep.txt"), "user data");
    }
  };
  await assert.rejects(service.create(input, 1), /TASK_CREATE_RETAINED/);
  assert.equal(await readFile(path.join(collisionPath, "keep.txt"), "utf8"), "user data");
  assert.equal((await service.repository.operations())[0].state, "retained");
  assert.equal((await service.load()).recoveryWarnings.length, 1);
});

test("中断恢复仅清理确认归属且未修改的工作区，用户改动现场保留", async (context) => {
  const { directory, service, settings, repo } = await setup(context);
  const record = await repo("repo");
  for (const dirty of [false, true]) {
    const id = randomUUID();
    const info = await service.inspectResource(record.id);
    const workspaceDirectory = path.join(settings.worktreesDirectory, id);
    const step = await prepareWorkspace(info, { resourceId: record.id, mode: "worktree", sourceBranch: info.git.defaultSource, targetBranch: "" }, settings.branchPrefix, workspaceDirectory);
    // 模拟升级前的任务分组目录，恢复仍须按旧清单清理。
    step.resource.workingPath = path.join(workspaceDirectory, "repo-1");
    const manifest = { workspaceDirectory, workspaceDirectoryOwned: false, attachmentDirectory: path.join(directory, "task-files", "production", id), attachmentDirectoryOwned: false, steps: [step] };
    const persist = () => service.repository.recordOperation(id, "pending", manifest);
    await persist();
    await createWorkspaceDirectory(manifest, persist);
    await createWorkspace(step, persist);
    if (dirty) await writeFile(path.join(step.resource.workingPath, "sample.txt"), "keep edits");
    const restarted = new TaskService(directory, "production", () => settings);
    const result = await restarted.load();
    if (dirty) {
      assert.equal(result.recoveryWarnings.length, 1);
      assert.equal(await readFile(path.join(step.resource.workingPath, "sample.txt"), "utf8"), "keep edits");
    } else {
      assert.equal(result.recoveryWarnings.length, 0);
      await assert.rejects(access(step.resource.workingPath), /ENOENT/);
    }
  }
});

test("自动分支在执行前遇到竞争冲突时重新生成，保留竞争方的分支", async (context) => {
  const { service, repo, inputFor } = await setup(context);
  const record = await repo("repo");
  const input = await inputFor([record]);
  const persist = service.repository.recordOperation.bind(service.repository);
  let collision;
  service.repository.recordOperation = async (id, state, manifest) => {
    await persist(id, state, manifest);
    if (!collision) {
      collision = manifest.steps[0].resource.targetBranch;
      await git(record.localPath, "branch", collision);
    }
  };
  const task = await service.create(input, 1);
  assert.notEqual(task.resources[0].targetBranch, collision);
  assert.equal(path.basename(task.resources[0].workingPath), "repo-" + task.resources[0].targetBranch.slice(-8));
  assert.ok(await git(record.localPath, "rev-parse", "refs/heads/" + collision));
});

test("原目录切换不覆盖被 Git 忽略的文件", async (context) => {
  const { service, repo, inputFor } = await setup(context);
  const record = await repo("repo");
  await git(record.localPath, "switch", "-c", "source");
  await writeFile(path.join(record.localPath, "ignored.txt"), "tracked on source");
  await git(record.localPath, "add", "ignored.txt");
  await git(record.localPath, "commit", "-m", "source file");
  await git(record.localPath, "switch", "main");
  await writeFile(path.join(record.localPath, ".git", "info", "exclude"), "ignored.txt\n");
  await writeFile(path.join(record.localPath, "ignored.txt"), "user ignored data");
  const input = await inputFor([record], ["new-branch"]);
  input.resources[0].sourceBranch = "refs/heads/source";
  await assert.rejects(service.create(input, 1));
  assert.equal(await readFile(path.join(record.localPath, "ignored.txt"), "utf8"), "user ignored data");
  assert.equal(await git(record.localPath, "branch", "--show-current"), "main");
});
