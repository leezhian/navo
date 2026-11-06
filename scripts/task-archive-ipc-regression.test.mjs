import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { createLoader } from "./helpers/load-typescript.mjs";

test("归档 IPC 与状态拖拽均先停止会话，清理范围取自确认凭据，普通移动不停止进程", async () => {
  const calls = []; const handlers = new Map(); let counter = 0; let issued;
  const records = [{ id: "task", title: "Task", status: "TODO" }];
  class TaskService {
    files = { release() {} };
    deletion = {
      forgetOwner() {},
      confirmationOptions(id, confirmation, owner, action) {
        if (!confirmation) return { deleteWorktrees: false, deleteBranches: false };
        if (!issued || issued.id !== id || issued.owner !== owner || issued.action !== action || issued.token !== confirmation.token) throw Error("TASK_ARCHIVE_CONFIRMATION");
        return issued.options;
      },
    };
    async inspectDeletion(id, options, owner, action) { issued = { id, options, owner, action, token: "token-" + ++counter }; return { token: issued.token }; }
    async archive(id, confirmation, owner, beforeId) { calls.push({ kind: "archive", id, confirmation, owner, beforeId }); records[0].status = "ARCHIVED"; return records; }
    async move(id, status) { calls.push({ kind: "move", id, status }); records[0].status = status; return records; }
  }
  const load = createLoader({
    electron: { app: { getPath: () => "/fixture", isPackaged: true }, BrowserWindow: { getAllWindows: () => [], fromWebContents: () => ({}) }, dialog: {}, ipcMain: { handle: (name, fn) => handlers.set(name, fn) } },
    "../services/taskService": { TaskService },
    "../services/settingsService": { getCurrentSettings: () => ({}) },
    "./agentHandlers": { resolveTaskAgentSelection: async value => value },
    "./taskResourceHandlers": { registerTaskResourceHandlers() {} },
    "./taskWorkspaceOpenHandlers": { registerTaskWorkspaceOpenHandlers() {} },
    "./taskBranchHandlers": { registerTaskBranchHandlers() {} },
    "./taskSessionHandlers": {
      registerTaskSessionHandlers() {}, startInitialTaskSession() {}, deleteTaskWithSessions() {},
      async archiveTaskWithSessions(id, closeTerminals, operation) { calls.push({ kind: "stop", id, closeTerminals }); return operation(); },
    },
    "./taskEvents": { publishTask: task => { calls.push({ kind: "publish", id: task.id, status: task.status }); return task; } },
  });
  const { registerTaskHandlers } = load("src/main-process/ipc/taskHandlers.ts");
  const { ipcChannels } = load("src/shared/ipcChannels.ts"); registerTaskHandlers();
  const sender = new EventEmitter(); sender.id = 12; const event = { sender };
  await handlers.get(ipcChannels.tasksMove)(event, "task", "DONE", null);
  assert.deepEqual(calls.map(item => item.kind), ["move", "publish"]); calls.length = 0;
  await handlers.get(ipcChannels.tasksMove)(event, "task", "ARCHIVED", null);
  assert.deepEqual(calls.map(item => item.kind), ["stop", "archive", "publish"]); assert.equal(calls[0].closeTerminals, false); calls.length = 0;
  const preview = await handlers.get(ipcChannels.tasksInspectDeletion)(event, "task", { deleteWorktrees: true, deleteBranches: false }, "archive");
  await handlers.get(ipcChannels.tasksArchive)(event, "task", { token: preview.token });
  assert.deepEqual(calls.map(item => item.kind), ["stop", "archive", "publish"]); assert.equal(calls[0].closeTerminals, true); assert.equal(calls[1].owner, sender.id); calls.length = 0;
  assert.throws(() => handlers.get(ipcChannels.tasksArchive)(event, "task", { token: "invalid" }), /TASK_ARCHIVE_CONFIRMATION/);
  assert.deepEqual(calls, []);
});
