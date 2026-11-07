import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const tw = readFileSync("src/components/tasks/workspace/TaskWorkspace.tsx", "utf8");
const menu = readFileSync("src/components/tasks/workspace/TaskWorkbenchMenu.tsx", "utf8");
const title = readFileSync("src/components/tasks/workspace/TaskTitleEditor.tsx", "utf8");
const hook = readFileSync("src/hooks/useTaskWorkspaceLayout.ts", "utf8");
const settings = readFileSync("src/components/settings/SettingsShortcuts.tsx", "utf8");
const zhSettings = JSON.parse(readFileSync("src/i18n/locales/zh-CN/settings.json", "utf8"));
const enSettings = JSON.parse(readFileSync("src/i18n/locales/en/settings.json", "utf8"));
const zhTasks = JSON.parse(readFileSync("src/i18n/locales/zh-CN/tasks.json", "utf8"));
const enTasks = JSON.parse(readFileSync("src/i18n/locales/en/tasks.json", "utf8"));

test("快捷键作用域：仅活动工作台响应，输入／终端／对话框忽略", () => {
  assert.match(tw, /function isActiveWorkbenchRoot/);
  assert.match(tw, /data-focused/);
  assert.match(tw, /getBoundingClientRect/);
  assert.match(tw, /function shouldIgnoreWorkbenchShortcut/);
  assert.match(tw, /\.xterm/);
  assert.match(tw, /data-slot=dialog-content/);
  assert.match(tw, /event\.key === "F2"/);
});

test("布局 flush：taskId 切换与卸载写回，update 同步 ref", () => {
  assert.match(hook, /writeTaskWorkspaceLayout\(taskId, layoutRef\.current\)/);
  assert.match(hook, /layoutRef\.current = next/);
  assert.match(hook, /clearTimeout\(timer\.current\)/);
});

test("详情内重命名与任务操作菜单接线", () => {
  assert.match(title, /onDoubleClick/);
  assert.match(title, /editRequest/);
  assert.match(menu, /onRename/);
  assert.match(menu, /archive/);
  assert.match(menu, /restore/);
  assert.match(menu, /delete/);
  assert.match(menu, /changeStatus/);
  assert.match(menu, /closeAllAgents/);
  assert.match(menu, /refreshWorkspace/);
  assert.match(menu, /addResource/);
  assert.match(tw, /TaskTitleEditor/);
  assert.match(tw, /TaskWorkbenchMenu/);
});

test("设置页列出四项快捷键且中英齐全", () => {
  assert.match(settings, /shortcutsRenameTask/);
  assert.match(settings, /shortcutsToggleContext/);
  assert.match(settings, /shortcutsToggleTerminal/);
  assert.match(settings, /shortcutsMaximizeTerminal/);
  for (const key of [
    "shortcutsRenameTask",
    "shortcutsRenameTaskDescription",
    "shortcutsToggleContext",
    "shortcutsToggleTerminal",
    "shortcutsMaximizeTerminal",
    "shortcutsMaximizeTerminalDescription",
  ]) {
    assert.equal(typeof zhSettings.general[key], "string", `zh ${key}`);
    assert.equal(typeof enSettings.general[key], "string", `en ${key}`);
  }
});

test("工作台菜单相关文案存在", () => {
  for (const bag of [zhTasks, enTasks]) {
    assert.equal(typeof bag.actions.changeStatus, "string");
    assert.equal(typeof bag.actions.addResource, "string");
    assert.equal(typeof bag.actions.closeAllAgents, "string");
    assert.equal(typeof bag.actions.refreshWorkspace, "string");
    assert.equal(typeof bag.actions.taskMenu, "string");
  }
});
