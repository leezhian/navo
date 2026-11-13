import type { Task } from "../domain/tasks";
import type { TaskSession } from "../shared/taskSessionTypes";

/** 页面可见仅触发休眠会话；用户停止、自然结束和失败不视为待恢复。 */
export function canAutoResumeSession(session: TaskSession | undefined, task: Task) {
  return Boolean(session && session.kind === "agent" && session.taskId === task.id && !session.archivedAt
    && session.status === "stopped" && session.resumable && session.nativeSessionId && !session.error && session.resumeOnOpen !== false
    && task.status !== "ARCHIVED" && !task.initialization?.some((step) => step.status !== "succeeded"));
}
