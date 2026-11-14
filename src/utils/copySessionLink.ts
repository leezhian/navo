import { taskSessionLink } from "@/shared/taskLinks";

/** 复制只含任务和会话 ID 的本机链接。 */
export function copySessionLink(taskId: string, sessionId: string) {
  return navigator.clipboard.writeText(taskSessionLink(taskId, sessionId));
}
