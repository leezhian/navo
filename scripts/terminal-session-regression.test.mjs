import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";
import { EventEmitter } from "node:events";

function fixture() {
  const destroyed = [];
  const decoders = new Map();
  const runtime = createLoader({
    "@/services/terminalApi": {
      createTerminal: async () => {}, resizeTerminal: async () => {}, writeTerminal: async () => {},
      destroyTerminal: async ({sessionId}) => destroyed.push(sessionId),
      onTerminalData: () => () => {}, onTerminalExit: () => () => {},
    },
    "./ghostty-vt/ghosttyVtClient": { ghosttyVtClient: {
      create: async () => {}, destroy: () => {}, resize: () => {}, write: () => {},
      subscribeErrors: (id, callback) => { decoders.set(id, callback); return () => decoders.delete(id); },
    } },
  });
  const manager = runtime("src/components/terminal/terminalSessionManager.ts");
  return {manager, destroyed, decoders};
}

test("任务会话的附着视图解码失败不能终止主进程拥有的 Agent", async () => {
  const {manager, destroyed, decoders} = fixture();
  manager.ensureManagedTerminalSession("task-agent", "/worktree", 80, 24, undefined, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(manager.getManagedTerminalStatus("task-agent"), "ready");
  decoders.get("task-agent")("decode failed");
  assert.equal(manager.getManagedTerminalStatus("task-agent"), "error");
  assert.deepEqual(destroyed, []);
  await manager.destroyManagedTerminalSession("task-agent");
  assert.deepEqual(destroyed, ["task-agent"]);
});

test("普通自建终端的初始化错误仍释放进程，不泄漏设置操作终端", async () => {
  const {manager, destroyed, decoders} = fixture();
  manager.ensureManagedTerminalSession("settings-operation", undefined, 80, 24);
  await new Promise(resolve => setImmediate(resolve));
  decoders.get("settings-operation")("decode failed");
  assert.equal(manager.getManagedTerminalStatus("settings-operation"), "error");
  assert.deepEqual(destroyed, ["settings-operation"]);
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
