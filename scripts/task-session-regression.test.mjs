import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, symlink, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { agentLaunchArguments } = load("src/main-process/services/taskSessions/launchArguments.ts");
const { prepareTaskContext } = load("src/main-process/services/taskSessions/taskContext.ts");
const selection = { agentId: "claude", modelId: "model", modelName: "Model", modeId: "plan", modeName: "plan", effort: "high" };
const help = "--model --permission-mode --session-id --resume --effort --reasoning-effort --mode --prompt-interactive --conversation --config";
const task = { id: "task-1", title: "Task", description: "Fix $(touch /tmp/unsafe)\nSecond line", date: new Date().toISOString(), projectName: "", status: "TODO", resources: [], agent: selection };

test("CLI 参数逐项传递，首条指令只交付一次，恢复使用精确原生 ID", () => {
  const args = agentLaunchArguments(selection, "uuid", task.description, false, help);
  assert.deepEqual(args.slice(-2), ["--", task.description]);
  assert.ok(args.includes("--session-id"));
  const resumed = agentLaunchArguments(selection, "uuid", task.description, true, help);
  assert.deepEqual(resumed.slice(-2), ["--resume", "uuid"]);
  assert.ok(!resumed.includes(task.description));
  for (const agentId of ["grok", "antigravity"]) assert.ok(agentLaunchArguments({ ...selection, agentId }, "uuid", task.description, false, help).includes(task.description));
  assert.throws(() => agentLaunchArguments(selection, "uuid", "prompt", false, "--model"), /OPTION_UNSUPPORTED/);
});

test("Codex 不伪造模式与恢复参数，reasoning 配置使用 TOML 字符串", () => {
  const args = agentLaunchArguments({ ...selection, agentId: "codex", modeId: "default" }, "uuid", "prompt", false, help);
  assert.ok(args.includes('model_reasoning_effort="high"'));
  assert.throws(() => agentLaunchArguments({ ...selection, agentId: "codex" }, "uuid", "prompt", false, help), /MODE_UNSUPPORTED/);
  assert.deepEqual(agentLaunchArguments({ ...selection, agentId: "antigravity" }, "uuid", "prompt", true, help).slice(-2), ["--conversation", "uuid"]);
  const resumed = agentLaunchArguments({ ...selection, agentId: "codex", modeId: "default" }, "uuid", "prompt", true, help);
  assert.equal(resumed[0], "resume");assert.deepEqual(resumed.slice(-2), ["--", "uuid"]);assert.ok(!resumed.includes("prompt"));
});

test("可见会话恢复合并并发请求，用户停止、归档任务和失败均不自动重启", async context => {
  const runtime = fixture();context.after(() => runtime.service.shutdown());
  const [created] = await runtime.service.start({ taskId: task.id, kind: "agent", agent: selection }, runtime.owner);
  const cold = fixture([{ ...created, status: "running" }]);context.after(() => cold.service.shutdown());
  const loaded = await cold.service.list();assert.equal(loaded[0].status, "stopped");assert.equal(cold.launches(), 0);
  const nativeId = loaded[0].nativeSessionId;
  await Promise.all([cold.service.restart(created.id, true, cold.owner, true), cold.service.restart(created.id, true, cold.owner, true)]);
  assert.equal(cold.launches(), 1);assert.equal((await cold.service.list())[0].nativeSessionId, nativeId);
  await cold.service.stop(created.id, cold.owner);
  await cold.service.restart(created.id, true, cold.owner, true);assert.equal(cold.launches(), 1);
  await cold.service.restart(created.id, true, cold.owner);assert.equal(cold.launches(), 2);
  const archived = fixture([{ ...created, status: "stopped" }], undefined, { task: { ...task, status: "ARCHIVED" } });context.after(() => archived.service.shutdown());
  await archived.service.restart(created.id, true, archived.owner, true);assert.equal(archived.launches(), 0);
  await assert.rejects(archived.service.restart(created.id, true, archived.owner), /SESSION_BUSY/);
  const failed = fixture([{ ...created, status: "failed", error: "SESSION_EXIT_FAILED" }]);context.after(() => failed.service.shutdown());
  await failed.service.restart(created.id, true, failed.owner, true);assert.equal(failed.launches(), 0);
});

test("自动工作目录隔离、多仓库上下文、无效目录与符号链接保护", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-context-"));
  try {
    const result = await prepareTaskContext(task, directory);
    assert.equal(result.cwd, await (await import("node:fs/promises")).realpath(path.join(directory, task.id)));
    assert.ok((await readFile(path.join(result.cwd, "navo-task.md"), "utf8")).includes(task.description));
    const repo = path.join(directory, "repo"); await mkdir(repo);
    const single = { ...task, resources: [{ resourceId: "repo", name: "repo", workingPath: repo, targetBranch: "feature" }] };
    assert.equal((await prepareTaskContext(single, directory)).cwd, await (await import("node:fs/promises")).realpath(repo));
    await assert.rejects(prepareTaskContext(single, directory, "missing"), /DIRECTORY_MISSING/);
    const multi = { ...single, id: "task-2", resources: [...single.resources, { ...single.resources[0], resourceId: "repo2" }] };
    assert.ok((await prepareTaskContext(multi, directory)).prompt.includes(repo));
    await symlink(repo, path.join(directory, "task-3"));
    await assert.rejects(prepareTaskContext({ ...task, id: "task-3" }, directory), /DIRECTORY_MISSING/);
    await assert.rejects(prepareTaskContext({ ...task, id: "../outside" }, directory), /TASK_INVALID/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

function fixture(initial = [], readTitle = async () => null, options = {}) {
  const saved = new Map(initial.map((session) => [session.id, structuredClone(session)]));
  const processes = new Map();
  let launches = 0;
  let failLaunch = false;
  const events = [];
  const nativeCalls = [];
  const runtime = createLoader({
    ...(options.readBinding ? { "./nativeSessionBinding": { readNativeSessionBinding: options.readBinding } } : {}),
    "./agentLaunch": { prepareAgentLaunch: async (...args) => { options.launchCalls?.push(args); if (failLaunch) throw new Error("AGENT_UNAVAILABLE"); options.prompts?.push(args[3]); if (options.context) options.context.push(await args[6]()); if (options.contextFiles) options.contextFiles.push(await args[8]()); return { command: "/mock/cli", args: [], env: {}, contextMode: options.context ? "dynamic" : options.contextFiles ? "file" : "snapshot" }; } },
    "./taskContext": { prepareTaskContext: options.prepareTaskContext ?? (async () => ({ cwd: os.tmpdir(), prompt: "task context" })), taskPrompt: options.taskPrompt ?? (() => "task context") },
    "../terminal/terminalService": {
      resolveShell: () => "/bin/zsh",
      createTerminal: (params, owner, launch) => { launches++; processes.set(params.sessionId, { params, owner, launch }); },
      destroyTerminal: ({ sessionId }) => { const process = processes.get(sessionId); processes.delete(sessionId); process?.launch.onFinish(); },
    },
  });
  const { TaskSessionService } = runtime("src/main-process/services/taskSessions/taskSessionService.ts");
  const repository = { load: async () => [...saved.values()].map((session) => structuredClone(session)), save: async (session) => { if (session.kind === "agent") saved.set(session.id, structuredClone(session)); }, remove: async id => { saved.delete(id); } };
  const nativeActions = { environment: async () => ({env:{},grokBinary:"/mock/grok"}), rename: async(session,title) => {
    assert.equal(processes.has(session.terminalId),false); nativeCalls.push(["rename",session.id,title]);
    if(options.failNative)throw new Error("SESSION_NATIVE_CHANGED");
  }, remove: async session => {
    assert.equal(processes.has(session.terminalId),false); nativeCalls.push(["remove",session.id]);
    if(options.failNative)throw new Error("SESSION_NATIVE_DELETE_FAILED");
  } };
  const service = new TaskSessionService(repository, options.agents ?? {}, options.loadTask ?? (async () => options.task ?? task), () => ({ tasksDirectory: options.tasksDirectory ?? os.tmpdir() }), (sessions) => events.push(structuredClone(sessions)), undefined, readTitle, nativeActions, async () => options.resources ?? [], undefined, options.readActivity ?? (async () => null));
  const owner = new EventEmitter(); owner.id = 1; owner.isDestroyed = () => false;
  const other = new EventEmitter(); other.id = 2; other.isDestroyed = () => false;
  return { service, saved, processes, owner, other, events, nativeCalls, launches: () => launches, fail: () => { failLaunch = true; } };
}

test("从会话新建沿用实际目录，使用新 Agent 默认配置与最新上下文，保留来源会话", async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-session-from-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const repo = path.join(directory, "repo"); await mkdir(repo);
  const current = { ...task, resources: [{ resourceId: "repo", name: "repo", mode: "worktree", workingPath: repo, sourceBranch: "main", targetBranch: "feature" }] };
  const capabilities = { agentId: "grok", models: [{ id: "default-model", name: "Default model", efforts: ["low"], defaultEffort: "low" }], modes: [{ id: "default", name: "Default" }], defaultModelId: "default-model", defaultModeId: "default" };
  const options = { task: current, tasksDirectory: path.join(directory, "tasks"), prepareTaskContext, taskPrompt: load("src/main-process/services/taskSessions/taskContext.ts").taskPrompt, prompts: [], agents: { capabilities: async () => capabilities } };
  const runtime = fixture([], undefined, options); context.after(() => runtime.service.shutdown());
  await runtime.service.start({ taskId: task.id, kind: "agent", resourceId: "repo", agent: selection }, runtime.owner);
  const [source] = await runtime.service.list(); const original = structuredClone(source);
  current.description = "Updated task prompt"; current.notes = [{ id: "note", title: "New note", content: "Current context" }];
  await runtime.service.start({ taskId: task.id, kind: "agent", sourceSessionId: source.id, agentId: "grok" }, runtime.owner);
  const created = (await runtime.service.list())[1];
  assert.equal(created.cwd, source.cwd); assert.deepEqual(created.workspace, source.workspace);
  assert.notEqual(created.id, source.id); assert.notEqual(created.terminalId, source.terminalId); assert.notEqual(created.nativeSessionId, source.nativeSessionId);
  assert.equal(created.agent.agentId, "grok"); assert.equal(created.agent.modelId, "default-model"); assert.equal(created.agent.effort, "low");
  assert.ok(options.prompts[1].includes("Updated task prompt")); assert.ok(options.prompts[1].includes("Current context"));
  assert.deepEqual(source, original); assert.ok(runtime.processes.has(source.terminalId)); assert.equal(runtime.launches(), 2);
  await runtime.service.start({ taskId: task.id, kind: "agent", resourceId: null, agent: selection }, runtime.owner);
  const all = (await runtime.service.list())[2]; options.tasksDirectory = path.join(directory, "moved-settings");
  await runtime.service.start({ taskId: task.id, kind: "agent", sourceSessionId: all.id, agentId: "grok" }, runtime.owner);
  const fromAll = (await runtime.service.list())[3]; assert.equal(fromAll.cwd, all.cwd); assert.deepEqual(fromAll.workspace, { kind: "all" });
  await runtime.service.archive(source.id, runtime.owner); const archived = structuredClone(source);
  await runtime.service.start({ taskId: task.id, kind: "agent", sourceSessionId: source.id, agentId: "grok" }, runtime.owner);
  const fromArchived = (await runtime.service.list())[4];
  assert.equal(fromArchived.cwd, source.cwd); assert.deepEqual(fromArchived.workspace, source.workspace);
  assert.notEqual(fromArchived.nativeSessionId, source.nativeSessionId); assert.equal(fromArchived.archivedAt, undefined);
  assert.deepEqual(source, archived); assert.equal(runtime.processes.has(source.terminalId), false);
  current.status = "ARCHIVED";
  await assert.rejects(runtime.service.start({ taskId: task.id, kind: "agent", sourceSessionId: source.id, agentId: "grok" }, runtime.owner), /SESSION_BUSY/);
  assert.equal((await runtime.service.list()).length, 5);
  await runtime.service.shutdown();
});

test("从会话新建拒绝越权、跨任务、失效目录和混合输入，归档来源也不回退其他目录", async context => {
  const current = { ...task, resources: [{ resourceId: "repo", name: "repo", workingPath: os.tmpdir(), mode: "worktree" }] };
  const runtime = fixture([], undefined, { task: current }); context.after(() => runtime.service.shutdown());
  await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
  const [source] = await runtime.service.list();
  const input = { taskId: task.id, kind: "agent", agentId: "grok", sourceSessionId: source.id };
  await assert.rejects(runtime.service.start(input, runtime.other), /SESSION_UNAVAILABLE/);
  for (const change of [{ sourceSessionId: null }, { sourceSessionId: "" }, { kind: "shell" }, { resourceId: null }, { agent: selection }, { commandId: "build" }, { agentId: undefined }]) await assert.rejects(runtime.service.start({ ...input, ...change }, runtime.owner), /TASK_INVALID/);
  current.id = "other-task"; await assert.rejects(runtime.service.start(input, runtime.owner), /SESSION_UNAVAILABLE/); current.id = task.id;
  current.resources = []; await assert.rejects(runtime.service.start(input, runtime.owner), /SESSION_DIRECTORY_MISSING/);
  current.resources = [{ resourceId: "repo", name: "repo", workingPath: path.join(os.tmpdir(), "navo-missing-" + source.id), mode: "worktree" }];
  await assert.rejects(runtime.service.start(input, runtime.owner), /SESSION_DIRECTORY_MISSING/);
  await runtime.service.archive(source.id, runtime.owner); await assert.rejects(runtime.service.start(input, runtime.owner), /SESSION_DIRECTORY_MISSING/);
  assert.equal((await runtime.service.list()).length, 1); assert.equal(runtime.launches(), 1);
});

test("Restore archive keeps native identity/options/cwd and activity, launches nothing and ignores old exit", async context => {
  const current = { ...task };
  const runtime = fixture([], undefined, { task: current });
  context.after(() => runtime.service.shutdown());
  await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
  const [session] = await runtime.service.list();
  const exit = runtime.processes.get(session.terminalId).launch.onExit;
  await runtime.service.archive(session.id, runtime.owner);
  const original = structuredClone(session);
  current.status = "ARCHIVED";
  await assert.rejects(runtime.service.restore(session.id, runtime.owner), /BUSY/);
  current.status = "TODO";
  await runtime.service.restore(session.id, runtime.owner);
  assert.equal(session.archivedAt, undefined); assert.equal(session.status, "stopped");
  for (const key of ["nativeSessionId", "cwd", "lastActiveAt"]) assert.equal(session[key], original[key]);
  assert.deepEqual(session.agent, original.agent); assert.equal(runtime.launches(), 1);
  exit(8); await runtime.service.list(); assert.equal(session.status, "stopped");
});

test("Session lifecycle revokes MCP credentials on stop/archive/window close and rotates them on restart", async context => {
  const connections = [];
  const runtime = fixture([], undefined, { context: connections });
  context.after(() => runtime.service.shutdown());
  const status = async connection => (await fetch(connection.url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${connection.token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) })).status;
  await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
  const [session] = await runtime.service.list();
  assert.equal(session.contextMode, "dynamic"); assert.equal(await status(connections[0]), 200);
  await runtime.service.stop(session.id, runtime.owner); assert.equal(await status(connections[0]), 401);
  await runtime.service.restart(session.id, true, runtime.owner); assert.equal(await status(connections[1]), 200);
  await runtime.service.archive(session.id, runtime.owner); assert.equal(await status(connections[1]), 401);
  await runtime.service.restore(session.id, runtime.owner); assert.equal(connections.length, 2);
  await runtime.service.restart(session.id, true, runtime.owner);
  runtime.owner.emit("destroyed"); await runtime.service.list(); assert.equal(await status(connections[2]), 401);
});

test("Agent startup/restart waits for initialization and workspace unlink is serialized with active sessions", async context => {
  const current = { ...task, resources: [{ resourceId: "repo", name: "repo", workingPath: os.tmpdir(), mode: "worktree" }], initialization: [{ status: "failed" }] };
  const runtime = fixture([], undefined, { task: current }); context.after(() => runtime.service.shutdown());
  await assert.rejects(runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner), /INITIALIZATION_REQUIRED/);
  assert.equal(runtime.launches(), 0);
  current.initialization[0].status = "succeeded";
  await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
  const [session] = await runtime.service.list();
  await assert.rejects(runtime.service.withIdleWorkspace(task.id, "repo", async () => true), /WORKSPACE_BUSY/);
  await runtime.service.stop(session.id, runtime.owner);
  assert.equal(await runtime.service.withIdleWorkspace(task.id, "repo", async () => true), true);
  current.initialization[0].status = "failed";
  await assert.rejects(runtime.service.restart(session.id, true, runtime.owner), /INITIALIZATION_REQUIRED/);
  assert.equal(runtime.launches(), 1);
});

test("Live-file sessions refresh committed context without PTY input or activity, and clean up on stop/restart", async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-session-live-context-"));
  const current = { ...task, contextVersion: 1, notes: [{ id: "note", title: "Note", content: "original" }] };
  const instructions = [];
  const runtime = fixture([], undefined, { task: current, contextFiles: instructions, tasksDirectory: directory });
  context.after(async () => { await runtime.service.shutdown(); await rm(directory, { recursive: true, force: true }); });
  await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
  const [session] = await runtime.service.list(); const originalActive = session.lastActiveAt;
  assert.equal(session.contextMode, "file");
  const first = JSON.parse(instructions[0].split("\n")[1]);
  current.description = "new prompt"; current.notes = []; current.contextVersion++;
  await runtime.service.updateTaskContext(task.id);
  const file = JSON.parse(await readFile(first, "utf8"));
  assert.equal(file.task.prompt, "new prompt"); assert.deepEqual(file.notes, []);
  assert.equal(session.lastActiveAt, originalActive); assert.equal(runtime.launches(), 1); assert.equal(session.contextSyncFailed, false);
  await assert.rejects(runtime.service.contextReminder(session.id, runtime.other), /UNAVAILABLE/);
  assert.ok((await runtime.service.contextReminder(session.id, runtime.owner)).includes(first));
  assert.equal(runtime.launches(), 1, "Copying a reminder does not restart or submit input");
  current.status = "ARCHIVED"; await runtime.service.updateTaskContext(task.id);
  assert.equal(JSON.parse(await readFile(first, "utf8")).unavailable, true);
  await assert.rejects(runtime.service.contextReminder(session.id, runtime.owner), /UNAVAILABLE/);
  current.status = "TODO"; await runtime.service.updateTaskContext(task.id);
  assert.equal(JSON.parse(await readFile(first, "utf8")).task.prompt, "new prompt");
  await runtime.service.stop(session.id, runtime.owner); await assert.rejects(readFile(first), { code: "ENOENT" });
  await runtime.service.updateTaskContext(task.id); await assert.rejects(readFile(first), { code: "ENOENT" });
  await runtime.service.restart(session.id, true, runtime.owner);
  const second = JSON.parse(instructions[1].split("\n")[1]); assert.notEqual(first, second);
  await rm(second); current.contextVersion++; await runtime.service.updateTaskContext(task.id);
  assert.equal(session.contextSyncFailed, true); assert.equal(session.status, "running");
  await runtime.service.archive(session.id, runtime.owner); assert.equal(runtime.processes.size, 0);
});

test("仓库命令只读取已保存脚本，在指定工作区执行并按命令去重，保留实际退出码", async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-command-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const originalPath = path.join(directory, "repo");const firstPath = path.join(directory, "first");const secondPath = path.join(directory, "second");
  await Promise.all([originalPath, firstPath, secondPath].map(directory => mkdir(directory)));
  const command = { id: "build", name: "Build", script: "printf '%s\\n' 'quoted text'\nprintf done", runOnWorktreeCreation: true };
  const record = { id: "repo", name: "repo", kind: "repo", localPath: originalPath, available: true, commands: [command] };
  const current = { ...task, resources: [firstPath, secondPath].map((workingPath, index) => ({ resourceId: "workspace-" + index, repositoryId: "repo", name: "repo", mode: "worktree", workingPath, originalPath, sourceBranch: "main", targetBranch: "feature" })) };
  const runtime = fixture([], undefined, { task: current, resources: [record], prepareTaskContext });
  context.after(() => runtime.service.shutdown());
  const input = { taskId: current.id, kind: "shell", resourceId: "workspace-0", commandId: "build", script: "untrusted renderer override" };
  const records = await runtime.service.start(input, runtime.owner);
  assert.equal(records.length, 1);assert.equal(records[0].title, "Build");assert.equal(records[0].cwd, await (await import("node:fs/promises")).realpath(firstPath));
  assert.deepEqual(records[0].command, { id: "build", name: "Build", resourceId: "workspace-0" });
  const process = runtime.processes.get(records[0].terminalId);
  assert.deepEqual(process.launch.args, ["-l", "-c", command.script]);assert.equal(process.launch.command, "/bin/zsh");assert.equal(process.launch.retainOnExit, true);
  assert.ok(!JSON.stringify(records[0]).includes(command.script));
  await Promise.all([runtime.service.start(input, runtime.owner), runtime.service.start(input, runtime.owner)]);assert.equal(runtime.launches(), 1);
  await assert.rejects(runtime.service.start(input, runtime.other), /SESSION_UNAVAILABLE/);
  await runtime.service.start({ ...input, resourceId: "workspace-1" }, runtime.owner);assert.equal(runtime.launches(), 2);
  await assert.rejects(runtime.service.start({ ...input, commandId: "missing" }, runtime.owner), /COMMAND_UNAVAILABLE/);
  await assert.rejects(runtime.service.start({ ...input, kind: "agent" }, runtime.owner), /TASK_INVALID/);
  await assert.rejects(runtime.service.start({ ...input, resourceId: null }, runtime.owner), /TASK_INVALID/);
  current.status = "ARCHIVED";await assert.rejects(runtime.service.start(input, runtime.owner), /COMMAND_UNAVAILABLE/);current.status = "TODO";
  process.launch.onExit(7);const exited = (await runtime.service.list()).find(item => item.id === records[0].id);
  assert.equal(exited.commandExitCode, 7);assert.equal(exited.status, "failed");
  command.script = "printf updated";await runtime.service.start(input, runtime.owner);assert.equal(runtime.launches(), 3);
  const latest = (await runtime.service.list()).at(-1);assert.equal(runtime.processes.get(latest.terminalId).launch.args.at(-1), "printf updated");
  await runtime.service.stop(latest.id, runtime.owner);assert.ok(!(await runtime.service.list()).some(item => item.id === latest.id));
  record.localPath = secondPath;await assert.rejects(runtime.service.start(input, runtime.owner), /COMMAND_UNAVAILABLE/);
});

test("多仓库普通终端使用选定资源的实际工作目录，不启动 Agent 或接受外来资源", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-shell-directories-"));
  const firstPath = path.join(directory, "first-worktree");
  const secondPath = path.join(directory, "second-worktree");
  await mkdir(firstPath);await mkdir(secondPath);
  const resources = [firstPath, secondPath].map((workingPath, index) => ({ resourceId: `repo-${index}`, name: `Repo ${index}`, mode: "worktree", workingPath, originalPath: "/not-the-worktree", sourceBranch: "main", targetBranch: `feature/${index}` }));
  const runtime = fixture([], async () => null, { task: { ...task, resources }, prepareTaskContext });
  try {
    await runtime.service.start({ taskId: task.id, kind: "shell", resourceId: "repo-1" }, runtime.owner);
    await runtime.service.start({ taskId: task.id, kind: "shell", resourceId: "repo-0" }, runtime.owner);
    const sessions = await runtime.service.list();
    assert.equal(sessions.length, 2);
    for (const [index, session] of sessions.entries()) {
      const expectedPath = await (await import("node:fs/promises")).realpath(index === 0 ? secondPath : firstPath);
      assert.equal(session.cwd, expectedPath);
      assert.equal(session.workspace.resourceId, index === 0 ? "repo-1" : "repo-0");
      assert.equal(session.agent, undefined);
      const process = runtime.processes.get(session.terminalId);
      assert.equal(process.params.cwd, expectedPath);
      assert.equal(process.launch.command, "/bin/zsh");
      assert.equal(process.launch.strictCwd, true);
    }
    await assert.rejects(runtime.service.start({ taskId: task.id, kind: "shell", resourceId: "outside-task" }, runtime.owner), /DIRECTORY_MISSING/);
    assert.equal(runtime.launches(), 2);
  } finally { await runtime.service.shutdown();await rm(directory, { recursive: true, force: true }); }
});

test("任务创建重试去重，挂载和 list 不重启，停止与恢复保留会话身份", async () => {
  const runtime = fixture();
  await Promise.all([runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner, true), runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner, true)]);
  assert.equal(runtime.launches(), 1);
  let [session] = await runtime.service.list();
  const nativeId = session.nativeSessionId;
  const terminalId = session.terminalId;
  assert.equal(session.status, "running");
  await runtime.service.list(); assert.equal(runtime.launches(), 1);
  await assert.rejects(runtime.service.stop(session.id, runtime.other), /UNAVAILABLE/);
  await assert.rejects(runtime.service.restart(session.id, true, runtime.owner), /BUSY/);
  await runtime.service.stop(session.id, runtime.owner);
  assert.equal(runtime.processes.size, 0);
  await runtime.service.restart(session.id, true, runtime.owner);
  [session] = await runtime.service.list();
  assert.equal(session.nativeSessionId, nativeId);
  assert.notEqual(session.terminalId, terminalId);
  assert.equal(runtime.launches(), 2);
});

test("运行中的 Agent 重启仍恢复原对话，失败不更换身份，旧退出事件不覆盖新进程", async () => {
  const launchCalls = [];
  const runtime = fixture([], undefined, { launchCalls });
  try {
    await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
    await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
    const [session, other] = await runtime.service.list();
    const oldTerminalId = session.terminalId;
    const nativeId = session.nativeSessionId;
    session.title = "Existing conversation"; session.titleSource = "cli"; session.nativeHistoryRoot = "/fixture/account-history";
    const originalAgent = structuredClone(session.agent); const originalCwd = session.cwd;
    const oldLaunch = runtime.processes.get(oldTerminalId).launch;
    await assert.rejects(runtime.service.restart(session.id, false, runtime.other), /UNAVAILABLE/);
    assert.equal(runtime.processes.size, 2);
    await runtime.service.restart(session.id, false, runtime.owner);
    assert.equal(runtime.processes.has(oldTerminalId), false);
    assert.equal(runtime.processes.has(other.terminalId), true);
    assert.equal(runtime.processes.size, 2);
    assert.notEqual(session.terminalId, oldTerminalId);
    assert.equal(session.nativeSessionId, nativeId);
    assert.equal(session.title, "Existing conversation"); assert.equal(session.titleSource, "cli");
    assert.deepEqual(session.agent, originalAgent); assert.equal(session.cwd, originalCwd);
    assert.equal(launchCalls.at(-1)[2], nativeId); assert.equal(launchCalls.at(-1)[4], true); assert.equal(launchCalls.at(-1)[5], "/fixture/account-history");
    oldLaunch.onExit(1);oldLaunch.onFinish();
    await runtime.service.list();assert.equal(session.status, "running");
    await runtime.service.stop(session.id, runtime.owner);
    assert.equal((await runtime.service.list()).length, 2);
    assert.equal(session.status, "stopped");assert.equal(runtime.processes.size, 1);
    runtime.fail();
    const otherNativeId = other.nativeSessionId;
    await runtime.service.restart(other.id, false, runtime.owner);
    assert.equal(other.nativeSessionId, otherNativeId); assert.equal(other.resumable, true);
    assert.equal(other.status, "failed");assert.equal(runtime.processes.size, 0);
    assert.equal((await runtime.service.list()).length, 2);
  } finally { await runtime.service.shutdown(); }
});

test("原生对话未识别时拒绝重启，不停止现有进程或伪造新对话", async context => {
  const runtime = fixture(); context.after(() => runtime.service.shutdown());
  await runtime.service.start({ taskId: task.id, kind: "agent", agent: { ...selection, agentId: "codex" } }, runtime.owner);
  const [session] = await runtime.service.list(); const original = structuredClone(session);
  await assert.rejects(runtime.service.restart(session.id, false, runtime.owner), /SESSION_RESUME_UNSUPPORTED/);
  assert.deepEqual(session, original); assert.ok(runtime.processes.has(session.terminalId)); assert.equal(runtime.launches(), 1);
});

test("归档任务停止其 Agent 并撤销上下文，保留历史和普通终端，不影响其他任务", async context => {
  const current = { ...task }; const another = { ...task, id: "other-task" }; const connections = [];
  const runtime = fixture([], undefined, { context: connections, loadTask: async id => id === current.id ? current : another });
  context.after(() => runtime.service.shutdown());
  await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
  await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
  await runtime.service.start({ taskId: task.id, kind: "shell" }, runtime.owner);
  await runtime.service.start({ taskId: another.id, kind: "agent" }, runtime.other);
  const [first, second, terminal, other] = await runtime.service.list();
  const nativeIds = [first.nativeSessionId, second.nativeSessionId]; const firstTerminal = first.terminalId;
  const exit = runtime.processes.get(firstTerminal).launch.onExit;
  await runtime.service.archiveTask(task.id, false, async () => {
    assert.equal(runtime.processes.has(firstTerminal), false); assert.equal(first.status, "stopped"); assert.equal(second.status, "stopped");
    assert.ok(runtime.processes.has(terminal.terminalId)); assert.ok(runtime.processes.has(other.terminalId)); current.status = "ARCHIVED";
  });
  assert.deepEqual([first.nativeSessionId, second.nativeSessionId], nativeIds);
  assert.equal(first.archivedAt, undefined); assert.equal(second.archivedAt, undefined); assert.equal(first.resumeOnOpen, false);
  assert.equal((await runtime.service.list()).length, 4); assert.equal(other.status, "running");
  const response = await fetch(connections[0].url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${connections[0].token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  assert.equal(response.status, 401); exit(7); await runtime.service.list(); assert.equal(first.status, "stopped");
  current.status = "TODO"; const launches = runtime.launches();
  await runtime.service.restart(first.id, true, runtime.owner, true); assert.equal(runtime.launches(), launches);
  await runtime.service.restart(first.id, true, runtime.owner); assert.equal(first.nativeSessionId, nativeIds[0]);
});

test("归档清理先关闭终端；清理或会话保存失败仍保留任务与对话身份", async context => {
  const runtime = fixture(); context.after(() => runtime.service.shutdown());
  await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
  await runtime.service.start({ taskId: task.id, kind: "shell" }, runtime.owner);
  const [session] = await runtime.service.list(); const nativeId = session.nativeSessionId;
  await assert.rejects(runtime.service.archiveTask(task.id, true, async () => {
    assert.equal(runtime.processes.size, 0); throw Error("TASK_DELETE_CHANGED");
  }), /TASK_DELETE_CHANGED/);
  const records = await runtime.service.list(); assert.equal(records.length, 1); assert.equal(records[0].nativeSessionId, nativeId); assert.equal(records[0].status, "stopped");
  await runtime.service.restart(session.id, true, runtime.owner);
  let completed = false; const save = runtime.service.repository.save.bind(runtime.service.repository);
  runtime.service.repository.save = async () => { throw Error("save failed"); };
  await assert.rejects(runtime.service.archiveTask(task.id, false, async () => { completed = true; }), /save failed/);
  assert.equal(completed, false); assert.equal(runtime.processes.size, 0); assert.equal(session.nativeSessionId, nativeId);
  runtime.service.repository.save = save;
});

test("启动失败保留任务会话、可重试；不同终端单调编号，全部关闭后为空", async () => {
  const runtime = fixture(); runtime.fail();
  await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
  const [failed] = await runtime.service.list();
  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "AGENT_UNAVAILABLE");
  await runtime.service.start({ taskId: task.id, kind: "shell" }, runtime.owner);
  await runtime.service.start({ taskId: task.id, kind: "shell" }, runtime.owner);
  const shells = (await runtime.service.list()).filter((session) => session.kind === "shell");
  assert.deepEqual(shells.map((session) => session.title), ["zsh1", "zsh2"]);
  for (const shell of shells) await runtime.service.stop(shell.id, runtime.owner);
  assert.equal((await runtime.service.list()).filter((session) => session.kind === "shell").length, 0);
  await runtime.service.start({ taskId: task.id, kind: "shell" }, runtime.owner);
  assert.equal((await runtime.service.list())[1].title, "zsh3");
});

test("重启应用只恢复记录不启动进程；窗口销毁会结束所属终端", async () => {
  const runtime = fixture([{ id: "saved", taskId: task.id, kind: "agent", status: "running", terminalId: "old" }]);
  assert.equal((await runtime.service.list())[0].status, "stopped");
  assert.equal(runtime.launches(), 0);
  await runtime.service.start({ taskId: task.id, kind: "shell" }, runtime.owner);
  runtime.owner.emit("destroyed");
  await runtime.service.list();
  assert.equal(runtime.processes.size, 0);
  assert.equal((await runtime.service.list()).length, 1);
});

test("删除任务先停止进程，清理失败保留会话，成功后移除；关闭应用不再启动", async () => {
  const runtime = fixture();
  await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
  await assert.rejects(runtime.service.deleteTask(task.id, async () => { assert.equal(runtime.processes.size, 0); throw new Error("delete failed"); }));
  assert.equal((await runtime.service.list()).length, 1);
  await runtime.service.deleteTask(task.id, async () => "ok");
  assert.equal((await runtime.service.list()).length, 0);
  await runtime.service.shutdown();
  await assert.rejects(runtime.service.start({ taskId: task.id, kind: "shell" }, runtime.owner), /UNAVAILABLE/);
});

test("退出码来自真实进程回调；失败会话不影响同任务的其他会话", async () => {
  const runtime = fixture();
  await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
  await runtime.service.start({ taskId: task.id, kind: "shell" }, runtime.owner);
  const [agent] = await runtime.service.list();
  runtime.processes.get(agent.terminalId).launch.onExit(7);
  const records = await runtime.service.list();
  assert.equal(records[0].status, "failed"); assert.equal(records[1].status, "running");
});

test("SQLite 持久化会话按命名空间隔离，删除任务级联删除", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "navo-sessions-db-"));
  const dbPath = path.join(directory, "app.db");
  try {
    const { TaskRepository } = load("src/main-process/services/taskRepository.ts");
    const { SessionRepository } = load("src/main-process/services/taskSessions/sessionRepository.ts");
    const tasks = new TaskRepository(dbPath, "development");
    await tasks.create({ ...task, agent: undefined }, []);
    const sessions = new SessionRepository(dbPath, "development");
    await sessions.save({ id: "session", taskId: task.id, kind: "agent", agent: selection, cwd: directory,
      terminalId: "task-terminal", resumable: false, createdAt: "2026-10-07T00:00:00.000Z",
      status: "stopped", title: "Native title", archivedAt: "2026-10-07T00:00:00.000Z" });
    assert.equal((await sessions.load()).length, 1);
    assert.equal((await sessions.load())[0].archivedAt, "2026-10-07T00:00:00.000Z");
    assert.equal((await sessions.load())[0].title, "Native title");
    assert.equal((await new SessionRepository(dbPath, "production").load()).length, 0);
    await tasks.update(() => []);
    assert.equal((await sessions.load()).length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("归档停止所属进程、保留记录，忽略延迟退出回调，禁止重启与恢复", async () => {
  const runtime = fixture();
  await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
  await runtime.service.start({ taskId: task.id, kind: "shell" }, runtime.owner);
  const [session] = await runtime.service.list();
  assert.equal(session.title, "");
  const exit = runtime.processes.get(session.terminalId).launch.onExit;
  await assert.rejects(runtime.service.archive(session.id, runtime.other), /UNAVAILABLE/);
  assert.equal(runtime.processes.size, 2);
  await runtime.service.archive(session.id, runtime.owner);
  assert.equal(runtime.processes.size, 1);
  assert.equal(session.status, "stopped");
  assert.ok(session.archivedAt);
  assert.equal(runtime.saved.get(session.id).archivedAt, session.archivedAt);
  exit(9);
  const records = await runtime.service.list();
  assert.equal(records[0].status, "stopped");
  await assert.rejects(runtime.service.restart(session.id, true, runtime.owner), /BUSY/);
  await assert.rejects(runtime.service.restart(session.id, false, runtime.owner), /BUSY/);
  await runtime.service.archive(session.id, runtime.owner);
  await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner, true);
  assert.equal(runtime.launches(), 2);
  const restored = fixture([...runtime.saved.values()]);
  assert.ok((await restored.service.list())[0].archivedAt);
  await runtime.service.shutdown(); await restored.service.shutdown();
});

test("列表只读保存名称，进入详情只同步当前任务未归档的真实名称", async () => {
  const initial = [{ id:"saved", taskId:task.id, kind:"agent", agent:selection, title:"Claude Code 1", status:"stopped", terminalId:"old" },
    { id:"other", taskId:"other-task", kind:"agent", agent:selection, title:"Other task title", status:"stopped", terminalId:"other-pty" },
    { id:"archived", taskId:task.id, kind:"agent", agent:selection, title:"Archived title", status:"stopped", terminalId:"archived-pty", archivedAt:"2026-10-07T00:00:00.000Z" }];
  const fallback = fixture(initial);
  assert.equal((await fallback.service.list())[0].title, "");
  const reads = [];
  const runtime = fixture(initial, async session => { reads.push(session.id); return "CLI title"; });
  assert.equal((await runtime.service.list())[0].title, "");
  assert.deepEqual(reads, []);
  const records = await runtime.service.refreshTitles(task.id);
  assert.deepEqual(reads, ["saved"]);
  assert.equal(records[0].title, "CLI title");
  assert.equal(records[1].title, "Other task title");
  assert.equal(records[2].title, "Archived title");
  assert.equal(runtime.saved.get("saved").title, "CLI title");
  assert.equal(runtime.saved.get("saved").titleSource, "cli");
  await runtime.service.shutdown(); await fallback.service.shutdown();
});

test("已有标题不后台轮询，状态和未读继续更新；进入详情才同步 CLI 改名", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let nativeTitle = "Initial native title";
  let titleReads = 0;
  const reply = "2026-11-13T01:00:00.000Z";
  const runtime = fixture([], async () => { titleReads++; return nativeTitle; }, {
    readActivity: async () => ({ phase: "idle", lastReplyAt: reply }),
  });
  try {
    await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
    assert.equal(titleReads, 1);
    nativeTitle = "CLI renamed title";
    context.mock.timers.tick(5000);
    const [session] = await runtime.service.list();
    assert.equal(session.title, "Initial native title");
    assert.equal(session.phase, "idle");
    assert.equal(session.lastReplyAt, reply);
    assert.equal(titleReads, 1);
    await runtime.service.refreshTitles(task.id);
    assert.equal(session.title, "CLI renamed title");
    assert.equal(titleReads, 2);
    assert.equal(runtime.launches(), 1);
    assert.equal(runtime.saved.get(session.id).title, nativeTitle);
    runtime.service.repository.save = async () => { throw new Error("write failed"); };
    await assert.rejects(runtime.service.archive(session.id, runtime.owner), /write failed/);
    assert.equal(session.status, "stopped");
    assert.equal(session.archivedAt, undefined);
    assert.equal(runtime.processes.size, 0);
    assert.equal((await runtime.service.list()).length, 1);
  } finally { await runtime.service.shutdown(); }
});

test("新会话标题延迟生成时在首次回复补读，取得标题后不再随回复重复读取", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let title = null, lastReplyAt;
  let reads = 0;
  const runtime = fixture([], async () => { reads++; return title; }, {
    readActivity: async () => ({ phase: "idle", lastReplyAt }),
  });
  context.after(() => runtime.service.shutdown());
  const [session] = await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
  assert.equal(session.title, "");
  context.mock.timers.tick(5000);
  await runtime.service.list();
  assert.equal(reads, 1);
  title = "First reply title"; lastReplyAt = "2026-11-13T01:00:00.000Z";
  context.mock.timers.tick(5000);
  await runtime.service.list();
  assert.equal(session.title, title);
  assert.equal(reads, 2);
  title = "Later title"; lastReplyAt = "2026-11-13T02:00:00.000Z";
  context.mock.timers.tick(5000);
  await runtime.service.list();
  assert.equal(reads, 2);
  assert.equal(session.lastReplyAt, lastReplyAt);
});

test("新会话原生 ID 延迟落盘仍可绑定，绑定后不随运行状态重复查询标题", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let native = null, bindingReads = 0;
  const runtime = fixture([], undefined, { readBinding: async () => { bindingReads++; return native; } });
  context.after(() => runtime.service.shutdown());
  const [session] = await runtime.service.start({ taskId: task.id, kind: "agent", agent: { ...selection, agentId: "codex" } }, runtime.owner);
  assert.equal(session.resumable, false);
  native = { id: "bound-native-id", title: "Bound native title" };
  context.mock.timers.tick(5000);
  await runtime.service.list();
  assert.equal(session.nativeSessionId, native.id);
  assert.equal(session.resumable, true);
  assert.equal(session.title, native.title);
  const reads = bindingReads;
  context.mock.timers.tick(5000);
  await runtime.service.list();
  assert.equal(bindingReads, reads);
});

for (const agentId of ["codex", "antigravity"]) for (const status of ["stopped", "failed"]) {
  test(`${agentId} ${status} 后延迟落盘仍后台补绑，完成后停止检查且不重启进程`, async context => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    let native = null, bindingReads = 0, activityReads = 0;
    const runtime = fixture([], undefined, {
      readBinding: async () => { bindingReads++; return native; },
      readActivity: async () => { activityReads++; return null; },
    });
    context.after(() => runtime.service.shutdown());
    const [session] = await runtime.service.start({ taskId: task.id, kind: "agent", agent: { ...selection, agentId } }, runtime.owner);
    if (status === "stopped") await runtime.service.stop(session.id, runtime.owner);
    else {
      runtime.processes.get(session.terminalId).launch.onExit(1);
      runtime.processes.delete(session.terminalId);
      await runtime.service.list();
    }
    const readsAfterStop = bindingReads, activityAfterStop = activityReads, lastActiveAt = session.lastActiveAt;
    context.mock.timers.tick(5000);
    await runtime.service.list();
    assert.ok(bindingReads > readsAfterStop);
    assert.equal(session.resumable, false);
    native = { id: "late-native-id", title: "Late native title" };
    context.mock.timers.tick(5000);
    await runtime.service.list();
    assert.equal(session.nativeSessionId, native.id);
    assert.equal(session.resumable, true);
    assert.equal(session.title, native.title);
    assert.equal(runtime.saved.get(session.id).nativeSessionId, native.id);
    assert.equal(runtime.events.at(-1)[0].resumable, true);
    assert.equal(session.status, status);
    assert.equal(session.resumeOnOpen, false);
    assert.equal(session.lastActiveAt, lastActiveAt);
    assert.equal(activityReads, activityAfterStop);
    assert.equal(runtime.launches(), 1);
    assert.equal(runtime.processes.size, 0);
    const completedReads = bindingReads;
    context.mock.timers.tick(10000);
    await runtime.service.list();
    assert.equal(bindingReads, completedReads);
    assert.equal(runtime.service.runtimeTimer, null);
  });
}

test("重启应用后继续补绑已保存的可靠关联，旧记录、其他 CLI 和归档会话不参与", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = { id: "pending", taskId: task.id, kind: "agent", agent: { ...selection, agentId: "codex" },
    status: "stopped", title: "", terminalId: "old-terminal", workspace: { kind: "task" }, cwd: os.tmpdir(),
    nativeLaunchId: "launch-ref", nativeHistoryRoot: "/fixture/codex", resumable: false, resumeOnOpen: false };
  const reads = [];
  const runtime = fixture([pending,
    { ...pending, id: "legacy", nativeLaunchId: undefined },
    { ...pending, id: "no-root", nativeHistoryRoot: undefined },
    { ...pending, id: "archived", archivedAt: "2026-11-13T01:00:00Z" },
    { ...pending, id: "claude", agent: selection },
  ], undefined, { readBinding: async session => { reads.push(session.id); return { id: "found-native", title: "Found title" }; } });
  context.after(() => runtime.service.shutdown());
  await runtime.service.list();
  assert.deepEqual(reads, []);
  context.mock.timers.tick(5000);
  const records = await runtime.service.list();
  assert.deepEqual(reads, ["pending"]);
  assert.equal(records[0].nativeSessionId, "found-native");
  assert.equal(records[0].status, "stopped");
  assert.equal(runtime.launches(), 0);
  context.mock.timers.tick(10000);
  await runtime.service.list();
  assert.deepEqual(reads, ["pending"]);
  assert.equal(runtime.service.runtimeTimer, null);
});

test("待绑定会话归档后停止核对，解除归档重新安排身份检查", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let native = null, bindingReads = 0;
  const runtime = fixture([], undefined, { readBinding: async () => { bindingReads++; return native; } });
  context.after(() => runtime.service.shutdown());
  const [session] = await runtime.service.start({ taskId: task.id, kind: "agent", agent: { ...selection, agentId: "codex" } }, runtime.owner);
  await runtime.service.archive(session.id, runtime.owner);
  const beforeArchive = bindingReads;
  context.mock.timers.tick(5000);
  await runtime.service.list();
  assert.equal(bindingReads, beforeArchive);
  assert.equal(runtime.service.runtimeTimer, null);
  native = { id: "restored-native", title: "Restored native title" };
  await runtime.service.restore(session.id, runtime.owner);
  context.mock.timers.tick(5000);
  await runtime.service.list();
  assert.equal(session.nativeSessionId, native.id);
  assert.equal(session.status, "stopped");
  assert.equal(runtime.launches(), 1);
});

test("快捷新建仅给 Agent ID，使用能力默认值，不沿用任务自定义模型/模式/思考等级",async()=>{
  const capabilities={agentId:"grok",models:[{id:"cli-default-model",name:"Default model",efforts:["low","high"],defaultEffort:"low"}],modes:[{id:"default",name:"Default"},{id:"plan",name:"Plan"}],defaultModelId:"cli-default-model",defaultModeId:"default"};
  const runtime=fixture([],undefined,{agents:{capabilities:async id=>{assert.equal(id,"grok");return capabilities;}}});
  await runtime.service.start({taskId:task.id,kind:"agent",agentId:"grok"},runtime.owner);
  const [session]=await runtime.service.list();
  assert.deepEqual(session.agent,{agentId:"grok",modelId:"cli-default-model",modelName:"Default model",modeId:"default",modeName:"Default",effort:"low"});
  await assert.rejects(runtime.service.start({taskId:task.id,kind:"agent",agentId:"grok",agent:selection},runtime.owner),/TASK_INVALID/);
  await runtime.service.shutdown();
});

test("会话范围持久化，重启与重新加载不把全局会话改为单目录", async () => {
  const resource = { resourceId: "repo", name: "navo", mode: "worktree", workingPath: os.tmpdir(), sourceBranch: "main", targetBranch: "feature" };
  const scopedTask = { ...task, resources: [resource] };
  const runtime = fixture([], undefined, { task: scopedTask });
  try {
    await assert.rejects(runtime.service.start({ taskId: task.id, kind: "agent", resourceId: "unknown" }, runtime.owner), /DIRECTORY_MISSING/);
    assert.equal((await runtime.service.list()).length, 0);
    await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
    await runtime.service.start({ taskId: task.id, kind: "agent", resourceId: null }, runtime.owner);
    const [single, all] = await runtime.service.list();
    assert.equal(single.workspace.branch, "feature");assert.deepEqual(all.workspace, { kind: "all" });
    await runtime.service.restart(all.id, false, runtime.owner);
    assert.deepEqual(runtime.saved.get(all.id).workspace, { kind: "all" });
    const reloaded = fixture([...runtime.saved.values()], undefined, { task: scopedTask });
    try {
      const restored = await reloaded.service.list();
      assert.equal(restored.find((item) => item.id === single.id).workspace.resourceId, "repo");
      assert.deepEqual(restored.find((item) => item.id === all.id).workspace, { kind: "all" });
    } finally { await reloaded.service.shutdown(); }
  } finally { await runtime.service.shutdown(); }
});

test("Rename/Delete 校验窗口、停止进程并同步原生记录，原生失败不会删除 Navo 记录",async()=>{
  const runtime=fixture();
  await runtime.service.start({taskId:task.id,kind:"agent"},runtime.owner);
  const [session]=await runtime.service.list();
  await assert.rejects(runtime.service.rename(session.id,"Name",runtime.other),/UNAVAILABLE/);
  await assert.rejects(runtime.service.rename(session.id,"",runtime.owner),/INVALID_NAME/);
  assert.equal(runtime.processes.size,1);
  await runtime.service.rename(session.id,"Native name",runtime.owner);
  assert.equal(session.status,"stopped");assert.equal(session.title,"Native name");
  assert.equal(runtime.saved.get(session.id).title,"Native name");assert.equal(session.nativeSessionId,runtime.saved.get(session.id).nativeSessionId);
  await runtime.service.remove(session.id,runtime.owner);
  assert.equal((await runtime.service.list()).length,0);assert.equal(runtime.saved.size,0);
  assert.deepEqual(runtime.nativeCalls.map(call=>call[0]),["rename","remove"]);
  const failed=fixture([],undefined,{failNative:true});
  await failed.service.start({taskId:task.id,kind:"agent"},failed.owner);
  const [failedSession]=await failed.service.list();
  await assert.rejects(failed.service.remove(failedSession.id,failed.owner),/NATIVE_DELETE_FAILED/);
  assert.equal((await failed.service.list()).length,1);assert.ok(failed.saved.has(failedSession.id));assert.equal(failedSession.status,"stopped");
  await runtime.service.shutdown();await failed.service.shutdown();
});

test("退出或停止前补读回复时间，只前进不回退，避免轮询间隙丢未读", async context => {
  let reply = "2026-11-07T01:00:00.000Z";
  const runtime = fixture([], undefined, { readActivity: async () => ({ phase: "idle", lastReplyAt: reply }) });context.after(() => runtime.service.shutdown());
  const [first] = await runtime.service.start({ taskId: task.id, kind: "agent", agent: selection }, runtime.owner);
  await runtime.service.stop(first.id, runtime.owner);
  assert.equal(runtime.saved.get(first.id).lastReplyAt, reply);assert.equal(runtime.saved.get(first.id).phase, undefined);
  const [, second] = await runtime.service.start({ taskId: task.id, kind: "agent", agent: selection }, runtime.owner);
  reply = "2026-11-07T02:00:00.000Z";
  runtime.processes.get(second.terminalId).launch.onExit(0);
  await runtime.service.list();
  assert.equal(runtime.saved.get(second.id).lastReplyAt, reply);
  reply = "2026-11-07T00:00:00.000Z";
  await runtime.service.restart(second.id, true, runtime.owner);
  await runtime.service.stop(second.id, runtime.owner);
  assert.equal(runtime.saved.get(second.id).lastReplyAt, "2026-11-07T02:00:00.000Z");
});
