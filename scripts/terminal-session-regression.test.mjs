import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

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
