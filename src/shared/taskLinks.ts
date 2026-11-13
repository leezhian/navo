export const TASK_LINK_SCHEME = "navo";
const TASK_LINK_PATTERN = /^navo:\/\/task\/([a-zA-Z0-9_-]{1,128})$/i;

/** 本机任务定位链接，仅携带任务 ID，不包含正文、文件路径或凭据。 */
export function taskLink(taskId: string) {
  return `${TASK_LINK_SCHEME}://task/${encodeURIComponent(taskId)}`;
}

/** 协议只允许定位任务；不接受其他路由、参数、路径或可执行动作。 */
export function parseTaskLink(value: string): string | null {
  // 对原始路径匹配，避免 URL 规范化将额外路径段折叠成一个看似合法的任务 ID。
  return TASK_LINK_PATTERN.exec(value)?.[1] ?? null;
}
