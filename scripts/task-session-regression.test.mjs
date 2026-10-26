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
const help = "--model --permission-mode --session-id --resume --effort --reasoning-effort --mode --prompt-interactive --config";
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
  assert.throws(() => agentLaunchArguments({ ...selection, agentId: "antigravity" }, "uuid", "prompt", true, help), /RESUME_UNSUPPORTED/);
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
    "./agentLaunch": { prepareAgentLaunch: async () => { if (failLaunch) throw new Error("AGENT_UNAVAILABLE"); return { command: "/mock/cli", args: [], env: {} }; } },
    "./taskContext": { prepareTaskContext: options.prepareTaskContext ?? (async () => ({ cwd: os.tmpdir(), prompt: "task context" })), taskPrompt: () => "task context" },
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
  const service = new TaskSessionService(repository, options.agents ?? {}, async () => options.task ?? task, () => ({ tasksDirectory: os.tmpdir() }), (sessions) => events.push(structuredClone(sessions)), undefined, readTitle, nativeActions, async () => options.resources ?? []);
  const owner = new EventEmitter(); owner.id = 1; owner.isDestroyed = () => false;
  const other = new EventEmitter(); other.id = 2; other.isDestroyed = () => false;
  return { service, saved, processes, owner, other, events, nativeCalls, launches: () => launches, fail: () => { failLaunch = true; } };
}

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

test("运行中的 Agent 可原子重启，旧退出事件不覆盖新进程，关闭保留记录", async () => {
  const runtime = fixture();
  try {
    await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
    await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
    const [session, other] = await runtime.service.list();
    const oldTerminalId = session.terminalId;
    const nativeId = session.nativeSessionId;
    const oldLaunch = runtime.processes.get(oldTerminalId).launch;
    await assert.rejects(runtime.service.restart(session.id, false, runtime.other), /UNAVAILABLE/);
    assert.equal(runtime.processes.size, 2);
    await runtime.service.restart(session.id, false, runtime.owner);
    assert.equal(runtime.processes.has(oldTerminalId), false);
    assert.equal(runtime.processes.has(other.terminalId), true);
    assert.equal(runtime.processes.size, 2);
    assert.notEqual(session.terminalId, oldTerminalId);
    assert.notEqual(session.nativeSessionId, nativeId);
    oldLaunch.onExit(1);oldLaunch.onFinish();
    await runtime.service.list();assert.equal(session.status, "running");
    await runtime.service.stop(session.id, runtime.owner);
    assert.equal((await runtime.service.list()).length, 2);
    assert.equal(session.status, "stopped");assert.equal(runtime.processes.size, 1);
    runtime.fail();
    await runtime.service.restart(other.id, false, runtime.owner);
    assert.equal(other.status, "failed");assert.equal(runtime.processes.size, 0);
    assert.equal((await runtime.service.list()).length, 2);
  } finally { await runtime.service.shutdown(); }
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

test("旧 Agent 加编号名称清理，加载同步真实名称并保留已归档标题", async () => {
  const initial = [{ id:"saved", taskId:task.id, kind:"agent", agent:selection, title:"Claude Code 1", status:"stopped", terminalId:"old" },
    { id:"archived", taskId:task.id, kind:"agent", agent:selection, title:"Archived title", status:"stopped", terminalId:"archived-pty", archivedAt:"2026-10-07T00:00:00.000Z" }];
  const fallback = fixture(initial);
  assert.equal((await fallback.service.list())[0].title, "");
  const runtime = fixture(initial, async () => "CLI title");
  const records = await runtime.service.list();
  assert.equal(records[0].title, "CLI title");
  assert.equal(records[1].title, "Archived title");
  assert.equal(runtime.saved.get("saved").title, "CLI title");
  assert.equal(runtime.saved.get("saved").titleSource, "cli");
  await runtime.service.shutdown(); await fallback.service.shutdown();
});

test("CLI 改名后台同步，不重启进程；归档保存失败时条目保留并已停止", { timeout: 10000 }, async () => {
  let nativeTitle = "Initial native title";
  const runtime = fixture([], async () => nativeTitle);
  try {
    await runtime.service.start({ taskId: task.id, kind: "agent" }, runtime.owner);
    nativeTitle = "CLI renamed title";
    await new Promise(resolve => setTimeout(resolve, 5200));
    const [session] = await runtime.service.list();
    assert.equal(session.title, "CLI renamed title");
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
