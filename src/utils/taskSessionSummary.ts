import type { TaskSession, TaskSessionStatus } from "@/shared/taskSessionTypes";

/** 分组展示优先突出异常；单一代表状态仍优先选择活跃会话，两者用途不同。 */
export const TASK_SESSION_GROUP_ORDER: TaskSessionStatus[] = ["failed", "running", "starting", "stopped"];
const STATUS_PRIORITY: TaskSessionStatus[] = ["running", "starting", "failed", "stopped"];

/** 仅统计当前任务未归档的 Agent 会话；平铺计数方便 store 浅比较。 */
export function countTaskSessions(sessions: TaskSession[], taskId: string): Record<TaskSessionStatus, number> {
  const counts = { starting: 0, running: 0, failed: 0, stopped: 0 };
  for (const session of sessions) {
    if (session.taskId !== taskId || session.kind !== "agent" || session.archivedAt) continue;
    counts[session.status] += 1;
  }
  return counts;
}

/** 标签页等只容纳一个图标的场景：活跃会话优于已结束的会话。 */
export function taskSessionSummary(sessions: TaskSession[], taskId: string) {
  const counts = countTaskSessions(sessions, taskId);
  return { count: Object.values(counts).reduce((total, count) => total + count, 0), status: STATUS_PRIORITY.find((status) => counts[status] > 0) };
}
