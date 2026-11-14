import { TASK_PROMPT_ID } from "./taskContextTypes";

export const TASK_LINK_SCHEME = "navo";
const TASK_LINK_PATTERN = /^navo:\/\/task\/([a-zA-Z0-9_-]{1,128})(?:\/(note|session)\/([a-zA-Z0-9_-]{1,128}))?$/i;
export interface TaskLinkTarget { taskId: string; noteId?: string; sessionId?: string }

export interface TaskLinkSessionSnapshot {
  id: string;
  taskId: string;
  kind: string;
}

/** 打开前的拦截原因。wait 表示会话列表还没到，此时不能先切换页面。 */
export type TaskLinkBlock = "missing" | "noteMissing" | "sessionMissing" | "wait";

/** 本机任务、笔记或会话定位链接，仅携带 ID，不包含正文、文件路径或凭据。 */
export function taskLink(taskId: string, noteId?: string) {
  return `${TASK_LINK_SCHEME}://task/${encodeURIComponent(taskId)}${noteId ? `/note/${encodeURIComponent(noteId)}` : ""}`;
}

/** 打开这条会话所在的任务，并定位到该会话；不携带对话内容。 */
export function taskSessionLink(taskId: string, sessionId: string) {
  return `${TASK_LINK_SCHEME}://task/${encodeURIComponent(taskId)}/session/${encodeURIComponent(sessionId)}`;
}

/** 协议只允许定位任务、笔记或会话；不接受其他路由、参数、路径或可执行动作。 */
export function parseTaskLink(value: string): TaskLinkTarget | null {
  // 对原始路径匹配，避免 URL 规范化将额外路径段折叠成一个看似合法的任务 ID。
  const match = TASK_LINK_PATTERN.exec(value);
  if (!match) return null;
  const target: TaskLinkTarget = { taskId: match[1] };
  if (match[2]?.toLowerCase() === "note" && match[3]) target.noteId = match[3];
  if (match[2]?.toLowerCase() === "session" && match[3]) target.sessionId = match[3];
  return target;
}

/** 找不到任务、笔记或会话时留在当前页。会话列表未加载时先等，避免误报或先打开任务。 */
export function blockTaskLink(
  target: TaskLinkTarget,
  task: { notes?: { id: string }[] } | undefined,
  sessionsLoaded: boolean,
  sessions: TaskLinkSessionSnapshot[],
): TaskLinkBlock | null {
  if (!task) return "missing";
  if (target.noteId && target.noteId !== TASK_PROMPT_ID && !task.notes?.some((note) => note.id === target.noteId)) return "noteMissing";
  if (!target.sessionId) return null;
  if (!sessionsLoaded) return "wait";
  const found = sessions.some((session) => session.id === target.sessionId && session.taskId === target.taskId && session.kind === "agent");
  return found ? null : "sessionMissing";
}
