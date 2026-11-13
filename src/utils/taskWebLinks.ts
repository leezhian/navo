import type { TaskWebLink } from "../shared/taskTypes";

export const TASK_LINK_URL_MAX_LENGTH = 8192;
export const TASK_LINK_TITLE_MAX_LENGTH = 200;

/** 仅记录网页地址，不抓取内容，也不接受脚本或本地文件协议。 */
export function isTaskLinkUrl(value: string) {
  if (!value || value.length > TASK_LINK_URL_MAX_LENGTH || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

export function isTaskWebLink(value: unknown): value is TaskWebLink {
  if (!value || typeof value !== "object") return false;
  const link = value as Record<string, unknown>;
  return typeof link.id === "string" && /^[a-f0-9-]{36}$/i.test(link.id)
    && typeof link.url === "string" && isTaskLinkUrl(link.url)
    && typeof link.title === "string" && link.title.length <= TASK_LINK_TITLE_MAX_LENGTH;
}
