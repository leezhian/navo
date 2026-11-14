import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createLoader } from "./helpers/load-typescript.mjs";

const { planSessionAlerts, watchingTaskIds } = createLoader()("src/utils/sessionAlerts.ts");
const { formatSessionAlert } = createLoader()("src/utils/sessionAlertCopy.ts");
const { sessionLaunchConfig } = createLoader()("src/utils/sessionLaunchConfig.ts");
const { normalizeAppSettings } = createLoader()("src/domain/settings.ts");

const channel = { desktop: true, inApp: true };
const settings = {
  replies: channel, questions: channel, permissions: channel, approvals: channel, errors: channel,
  sound: true, includeForeground: false,
};
const agent = { id: "s1", taskId: "t1", kind: "agent", title: "计划", status: "running", lastReplyAt: "2026-11-07T01:00:00.000Z" };
const focused = { windowFocused: true, foregroundSessionIds: new Set(), foregroundTaskIds: new Set() };
const away = { windowFocused: false, foregroundSessionIds: new Set(), foregroundTaskIds: new Set() };

test("运行配置只回显已保存的模型、模式和思考等级", () => {
  assert.equal(sessionLaunchConfig(undefined), null);
  assert.equal(sessionLaunchConfig({ agentId: "grok", modelId: "m", modelName: "Grok 4", modeId: "d", modeName: "default", effort: null }), "Grok 4 · default");
  assert.equal(sessionLaunchConfig({ agentId: "grok", modelId: "m", modelName: "Grok 4", modeId: "d", modeName: "default", effort: "high" }), "Grok 4 · default · high");
});

test("通知默认关闭回复，权限和错误两边都开，旧总开关只迁移桌面", () => {
  const normalized = normalizeAppSettings({});
  assert.deepEqual(normalized.notifications.replies, { desktop: false, inApp: false });
  assert.deepEqual(normalized.notifications.permissions, { desktop: true, inApp: true });
  assert.deepEqual(normalized.notifications.errors, { desktop: true, inApp: true });
  assert.equal(normalized.notifications.sound, true);
  assert.equal(normalized.notifications.includeForeground, false);
  assert.deepEqual(normalizeAppSettings({ sessionNotifyReplies: false }).notifications.replies, { desktop: false, inApp: false });
  assert.deepEqual(normalizeAppSettings({ sessionNotifyFailures: false }).notifications.errors, { desktop: false, inApp: true });
});

test("后台走桌面，使用中走应用内；正在查看的任务默认保持安静", () => {
  const replied = { ...agent, lastReplyAt: "2026-11-07T01:05:00.000Z" };
  assert.equal(planSessionAlerts([agent], [replied], settings, focused)[0].channel, "inApp");
  assert.equal(planSessionAlerts([agent], [replied], settings, away)[0].channel, "desktop");
  assert.equal(planSessionAlerts([agent], [replied], { ...settings, replies: { desktop: false, inApp: false } }, away).length, 0);
  assert.equal(planSessionAlerts([agent], [{ ...agent, lastReplyAt: "2026-11-07T00:00:00.000Z" }], settings, away).length, 0);
  const waiting = { ...agent, phase: "waitingPermission", waitingReason: "Bash" };
  assert.equal(planSessionAlerts([agent], [waiting], settings, away)[0].kind, "permission");
  assert.deepEqual(planSessionAlerts([agent], [waiting], settings, { windowFocused: true, foregroundSessionIds: new Set(["s1"]), foregroundTaskIds: new Set() }), []);
  assert.equal(planSessionAlerts([agent], [waiting], { ...settings, includeForeground: true }, { windowFocused: true, foregroundSessionIds: new Set(["s1"]), foregroundTaskIds: new Set() })[0].channel, "inApp");
  assert.equal(planSessionAlerts([waiting], [waiting], settings, away).length, 0);
  const failed = { ...agent, status: "failed", error: "SESSION_START_FAILED" };
  assert.equal(planSessionAlerts([agent], [failed], settings, away)[0].kind, "failure");
  assert.equal(planSessionAlerts([agent], [failed], settings, { ...away, foregroundTaskIds: new Set(["t1"]), windowFocused: true }).length, 0);
  assert.equal(planSessionAlerts([failed], [failed], settings, away).length, 0);
  assert.equal(planSessionAlerts([], [{ ...agent, archivedAt: "2026-11-07T02:00:00.000Z", status: "failed" }], settings, away).length, 0);
  assert.equal(planSessionAlerts([], [{ ...agent, kind: "shell", status: "failed" }], settings, away).length, 0);
  assert.equal(planSessionAlerts([], [{ ...agent, lastReplyAt: "2026-11-07T03:00:00.000Z" }], settings, away).length, 0);
});

test("同一工具再次等待权限、同一错误码再次失败仍会提醒", () => {
  const waiting = { ...agent, phase: "waitingPermission", waitingReason: "Bash" };
  const idle = { ...agent, phase: "idle" };
  assert.equal(planSessionAlerts([waiting], [idle], settings, away).length, 0);
  assert.equal(planSessionAlerts([idle], [waiting], settings, away)[0].kind, "permission");
  assert.equal(planSessionAlerts([waiting], [{ ...waiting, waitingReason: "Edit" }], settings, away)[0].reason, "Edit");
  const failed = { ...agent, status: "failed", error: "SESSION_START_FAILED" };
  const running = { ...agent, status: "running" };
  assert.equal(planSessionAlerts([failed], [running], settings, away).length, 0);
  assert.equal(planSessionAlerts([running], [failed], settings, away)[0].kind, "failure");
});

test("工作台隐藏时，记住的任务标识不算正在查看", () => {
  const split = { id: "sp", firstTaskId: "t1", secondTaskId: "t2", orientation: "horizontal", ratios: { horizontal: 0.5, vertical: 0.5 } };
  assert.equal(watchingTaskIds("t1", [split], false).size, 0);
  assert.equal(watchingTaskIds(null, [split], true).size, 0);
  assert.deepEqual([...watchingTaskIds("t1", [], true)], ["t1"]);
  assert.deepEqual([...watchingTaskIds("t1", [split], true)].sort(), ["t1", "t2"]);
});

test("通知正文只有名称和状态，批准说明不把删除工作区当成通知", () => {
  const translate = (key, values) => `${key}:${values?.reason ?? ""}`;
  const permission = formatSessionAlert({ kind: "permission", reason: "Bash", name: "计划" }, "未命名", translate);
  assert.match(permission.title, /permissionTitle/);
  assert.match(permission.body, /permissionBody:Bash/);
  assert.match(formatSessionAlert({ kind: "permission", name: "计划" }, "未命名", translate).body, /permissionFallback/);
  const zhTasks = JSON.parse(readFileSync("src/i18n/locales/zh-CN/tasks.json", "utf8"));
  const enTasks = JSON.parse(readFileSync("src/i18n/locales/en/tasks.json", "utf8"));
  const zhSettings = JSON.parse(readFileSync("src/i18n/locales/zh-CN/settings.json", "utf8"));
  const enSettings = JSON.parse(readFileSync("src/i18n/locales/en/settings.json", "utf8"));
  for (const body of [zhTasks.runtime.notify.replyBody, zhTasks.runtime.notify.failureBody, enTasks.runtime.notify.replyBody, enTasks.runtime.notify.failureBody]) {
    assert.doesNotMatch(body, /回到|Open the session|批准|Approval/);
  }
  assert.match(zhTasks.runtime.notify.permissionBody, /\{\{reason\}\}/);
  assert.doesNotMatch(zhTasks.runtime.notify.permissionBody, /批准/);
  assert.doesNotMatch(enTasks.runtime.notify.permissionBody, /Approval/);
  assert.doesNotMatch(zhSettings.notifications.topic.approvalsDescription, /Worktree|分支/);
  assert.doesNotMatch(enSettings.notifications.topic.approvalsDescription, /worktree|branch/i);
});
