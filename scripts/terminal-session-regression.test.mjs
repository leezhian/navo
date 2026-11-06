import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";
import { EventEmitter } from "node:events";

function fixture({ failSurface = false } = {}) {
  const destroyed = [], created = [], surfaces = new Map();
  let onData, onExit;
  const runtime = createLoader({
    "@/services/terminalApi": {
      createTerminal: async params => { created.push(params); if (params.attachOnly) onData({sessionId: params.sessionId, data: "history", replay: true}); },
      resizeTerminal: async () => {}, writeTerminal: async () => {}, destroyTerminal: async ({sessionId}) => destroyed.push(sessionId),
      onTerminalData: callback => { onData = callback; return () => {}; }, onTerminalExit: callback => { onExit = callback; return () => {}; },
    },
    "./ghosttyTerminalSurface": { GhosttyTerminalSurface: { create: async () => {
      if (failSurface) throw new Error("WASM unavailable");
      const surface = { output: "", disposed: false, write(data) { if (this.failWrite) throw new Error("decode failed"); this.output += data; }, dispose() { this.disposed = true; }, setReadOnly() {} };
      surfaces.set(surfaces.size, surface); return surface;
    } } },
  });
  const manager = runtime("src/components/terminal/terminalSessionManager.ts");
  return {manager, destroyed, created, surfaces, data: payload => onData(payload), exit: id => onExit({sessionId: id, exitCode: 0})};
}

test("任务视图解码失败不能终止 Agent，重复挂载不重复附着或重放", async () => {
  const {manager, destroyed, created, surfaces, data} = fixture();
  manager.ensureManagedTerminalSession("task-agent", "/worktree", 80, 24, undefined, true);
  data({sessionId: "task-agent", data: "history"}); // 回放前的广播不能重复进入画面。
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(manager.getManagedTerminalStatus("task-agent"), "ready");
  assert.equal(surfaces.get(0).output, "history");
  data({sessionId: "task-agent", data: " live"});
  manager.ensureManagedTerminalSession("task-agent", "/worktree", 100, 30, undefined, true);
  assert.equal(created.length, 1); assert.equal(surfaces.get(0).output, "history live");
  surfaces.get(0).failWrite = true; data({sessionId: "task-agent", data: "bad"});
  assert.equal(manager.getManagedTerminalStatus("task-agent"), "error"); assert.deepEqual(destroyed, []);
  await manager.destroyManagedTerminalSession("task-agent"); assert.deepEqual(destroyed, ["task-agent"]);
});

test("设置操作渲染初始化失败不启动命令，快速退出不被 ready 覆盖", async () => {
  const failed = fixture({failSurface: true});
  failed.manager.ensureManagedTerminalSession("settings-operation", undefined, 80, 24);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failed.manager.getManagedTerminalStatus("settings-operation"), "error");
  assert.deepEqual(failed.created, []); assert.deepEqual(failed.destroyed, ["settings-operation"]);
  const runtime = fixture();
  runtime.manager.ensureManagedTerminalSession("quick", "/worktree", 80, 24, undefined, true);
  runtime.exit("quick");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.manager.getManagedTerminalStatus("quick"), "exited");
  assert.equal(runtime.surfaces.get(0).output, "history");
  await runtime.manager.destroyManagedTerminalSession("quick");
});

test("只有真实非空 PTY 输入输出通知活动，附着回放、缩放及关闭后回调不通知", () => {
  let onData;
  let failWrite = false;
  let activities = 0;
  const pty = { pid: 123, onData: callback => { onData = callback; }, onExit: () => {}, resize: () => {}, kill: () => {},
    write: () => { if (failWrite) throw new Error("closed"); } };
  const terminal = createLoader({ "node-pty": { spawn: () => pty }, "./terminateProcessTree": { terminateDescendants: () => {} } })
    ("src/main-process/services/terminal/terminalService.ts");
  const owner = new EventEmitter();
  owner.id = 1; owner.isDestroyed = () => false; owner.send = () => {};
  const params = { sessionId: "activity", cols: 80, rows: 24 };
  try {
    terminal.createTerminal(params, owner, { command: "/mock/shell", args: [], env: {}, onFinish: () => {}, onActivity: () => activities++ });
    onData("output");
    terminal.writeTerminal({ sessionId: params.sessionId, data: "input" }, owner.id);
    assert.equal(activities, 2);
    onData("");
    terminal.writeTerminal({ sessionId: params.sessionId, data: "" }, owner.id);
    terminal.attachTerminal(params, owner.id);
    terminal.resizeTerminal({ ...params, cols: 90 }, owner.id);
    assert.equal(activities, 2);
    assert.throws(() => terminal.writeTerminal({ sessionId: params.sessionId, data: "foreign" }, 2));
    failWrite = true;
    assert.throws(() => terminal.writeTerminal({ sessionId: params.sessionId, data: "failed" }, owner.id));
    assert.equal(activities, 2);
    terminal.destroyTerminal(params, owner.id);
    onData("late output");
    assert.equal(activities, 2);
  } finally { terminal.destroyAllTerminals(); }
});

test("快速命令退出后可按所有权附着输出和退出码，关闭不误杀已退出的 PID", () => {
  let onData, onExit;const sent = [];let kills = 0;
  const pty = { pid: 123, onData: callback => { onData = callback; }, onExit: callback => { onExit = callback; }, resize: () => {}, kill: () => { kills++; }, write: () => {} };
  const terminal = createLoader({ "node-pty": { spawn: () => pty }, "./terminateProcessTree": { terminateDescendants: () => { kills++; } } })("src/main-process/services/terminal/terminalService.ts");
  const owner = new EventEmitter();owner.id = 1;owner.isDestroyed = () => false;owner.send = (channel, payload) => sent.push({ channel, payload });
  const params = { sessionId: "quick-command", cols: 80, rows: 24 };
  terminal.createTerminal(params, owner, { command: "/mock/shell", args: [], env: {}, retainOnExit: true, onFinish: () => {} });
  onData("Command output");onExit({ exitCode: 7 });sent.length = 0;
  assert.throws(() => terminal.attachTerminal(params, 2), /SESSION_UNAVAILABLE/);
  terminal.attachTerminal(params, owner.id);
  assert.equal(sent[0].payload.data, "Command output");assert.equal(sent[1].payload.exitCode, 7);
  assert.throws(() => terminal.writeTerminal({ sessionId: params.sessionId, data: "no" }, owner.id));
  terminal.destroyTerminal(params, owner.id);assert.equal(kills, 0);
  assert.throws(() => terminal.attachTerminal(params, owner.id), /SESSION_UNAVAILABLE/);
  terminal.destroyAllTerminals();
});
