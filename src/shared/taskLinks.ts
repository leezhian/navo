export const TASK_LINK_SCHEME = "navo";
const TASK_LINK_PATTERN = /^navo:\/\/task\/([a-zA-Z0-9_-]{1,128})(?:\/note\/([a-zA-Z0-9_-]{1,128}))?$/i;
export interface TaskLinkTarget { taskId: string; noteId?: string }

/** 本机任务和笔记定位链接，仅携带 ID，不包含正文、文件路径或凭据。 */
export function taskLink(taskId: string, noteId?: string) {
  return `${TASK_LINK_SCHEME}://task/${encodeURIComponent(taskId)}${noteId ? `/note/${encodeURIComponent(noteId)}` : ""}`;
}

/** 协议只允许定位任务；不接受其他路由、参数、路径或可执行动作。 */
export function parseTaskLink(value: string): TaskLinkTarget | null {
  // 对原始路径匹配，避免 URL 规范化将额外路径段折叠成一个看似合法的任务 ID。
  const match = TASK_LINK_PATTERN.exec(value);
  return match ? { taskId: match[1], ...(match[2] ? { noteId: match[2] } : {}) } : null;
}
