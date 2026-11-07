import type { TaskSession, TaskSessionStatus } from "@/shared/taskSessionTypes";
import { isSessionUnread } from "./sessionReadMarks";

/** 汇总展示用的状态；unread 不是进程态，只表示有未读回复。 */
export type TaskSessionSummaryStatus = TaskSessionStatus | "unread";

/** 分组展示优先突出异常；单一代表状态与分组顺序一致。 */
export const TASK_SESSION_GROUP_ORDER: TaskSessionSummaryStatus[] = ["failed", "unread", "running", "starting", "stopped"];
const STATUS_PRIORITY: TaskSessionSummaryStatus[] = ["failed", "unread", "running", "starting", "stopped"];

export type TaskSessionCounts = Record<TaskSessionSummaryStatus, number>;

/** 仅统计当前任务未归档的 Agent 会话；平铺计数方便 store 浅比较。未读单独计数，不从进程态中扣除。 */
export function countTaskSessions(sessions: TaskSession[], taskId: string): TaskSessionCounts {
  const counts: TaskSessionCounts = { starting: 0, running: 0, failed: 0, stopped: 0, unread: 0 };
  for (const session of sessions) {
    if (session.taskId !== taskId || session.kind !== "agent" || session.archivedAt) continue;
    counts[session.status] += 1;
    if (isSessionUnread(session)) counts.unread += 1;
  }
  return counts;
}

/** 标签页等只容纳一个图标的场景：失败优于未读，未读优于活跃会话，再优于已停止。 */
export function taskSessionSummary(sessions: TaskSession[], taskId: string) {
  const counts = countTaskSessions(sessions, taskId);
  return { count: Object.values(counts).reduce((total, count) => total + count, 0) - counts.unread, status: STATUS_PRIORITY.find((status) => counts[status] > 0) };
}
