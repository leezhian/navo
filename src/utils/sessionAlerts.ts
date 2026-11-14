import { findTaskSplit, type TaskSplit } from "@/domain/taskSplit";
import type { NotificationPreferences } from "@/domain/types";
import type { TaskSession } from "@/shared/taskSessionTypes";

export type SessionAlertKind = "reply" | "permission" | "failure";
export type SessionAlertChannel = "desktop" | "inApp";

export interface SessionAlert {
  sessionId: string;
  taskId: string;
  kind: SessionAlertKind;
  /** 后台用桌面通知，使用中用应用内提醒，同一事件不同时走两条。 */
  channel: SessionAlertChannel;
  /** 这一次变化的标识：回复时间、权限原因或失败码。离开后再进入仍要提醒。 */
  key: string;
  name: string;
  reason?: string;
}

interface AlertSnapshot {
  lastReplyAt?: string;
  phase?: TaskSession["phase"];
  waitingReason?: string;
  status: TaskSession["status"];
}

/** 窗口在后台走桌面通道，使用中走应用内通道。正在查看的任务默认保持安静。 */
export function planSessionAlerts(previous: TaskSession[], next: TaskSession[], settings: NotificationPreferences, options: { windowFocused: boolean; foregroundSessionIds: ReadonlySet<string>; foregroundTaskIds: ReadonlySet<string> }): SessionAlert[] {
  const before = new Map(previous.filter(isAlertable).map((session) => [session.id, snapshot(session)]));
  const channel: SessionAlertChannel = options.windowFocused ? "inApp" : "desktop";
  const alerts: SessionAlert[] = [];
  for (const session of next) {
    if (!isAlertable(session)) continue;
    const prior = before.get(session.id);
    const watching = options.windowFocused && (options.foregroundSessionIds.has(session.id) || options.foregroundTaskIds.has(session.taskId));
    if (watching && !settings.includeForeground) continue;
    if (settings.replies[channel] && prior && session.lastReplyAt && isLater(session.lastReplyAt, prior.lastReplyAt)) {
      alerts.push(alert(session, "reply", channel, session.lastReplyAt));
    }
    if (settings.permissions[channel] && session.phase === "waitingPermission" && (prior?.phase !== "waitingPermission" || prior.waitingReason !== session.waitingReason)) {
      alerts.push(alert(session, "permission", channel, session.waitingReason ?? "permission", session.waitingReason));
    }
    if (settings.errors[channel] && session.status === "failed" && prior?.status !== "failed") {
      alerts.push(alert(session, "failure", channel, session.error ?? "failed"));
    }
  }
  return alerts;
}

/** 只有工作台正在显示时，当前任务和并排同时可见的任务才算正在查看。 */
export function watchingTaskIds(activeTaskId: string | null, splits: TaskSplit[], workspaceVisible: boolean) {
  const ids = new Set<string>();
  if (!workspaceVisible || !activeTaskId) return ids;
  const split = findTaskSplit(splits, activeTaskId);
  if (!split) {
    ids.add(activeTaskId);
    return ids;
  }
  ids.add(split.firstTaskId);
  if (split.secondTaskId) ids.add(split.secondTaskId);
  return ids;
}

function isAlertable(session: TaskSession) {
  return session.kind === "agent" && !session.archivedAt;
}

function snapshot(session: TaskSession): AlertSnapshot {
  return { lastReplyAt: session.lastReplyAt, phase: session.phase, waitingReason: session.waitingReason, status: session.status };
}

function isLater(next: string, previous?: string) {
  if (!previous) return true;
  return Date.parse(next) > Date.parse(previous);
}

function alert(session: TaskSession, kind: SessionAlertKind, channel: SessionAlertChannel, key: string, reason?: string): SessionAlert {
  return { sessionId: session.id, taskId: session.taskId, kind, channel, key, name: session.title, reason };
}
