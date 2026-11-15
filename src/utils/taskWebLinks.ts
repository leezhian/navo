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

export function canonicalTaskLinkUrl(url: string) {
  return new URL(url).href;
}

export interface AggregatedTaskWebLink extends TaskWebLink {
  /** 同一规范 URL 的全部条目，按原顺序；维护操作作用于整组。 */
  ids: string[];
}

/** 历史重复 URL 聚合成一行，标题取第一条非空标题。 */
export function aggregateTaskWebLinks(links: TaskWebLink[]): AggregatedTaskWebLink[] {
  const groups = new Map<string, TaskWebLink[]>();
  for (const link of links) {
    const url = canonicalTaskLinkUrl(link.url);
    const group = groups.get(url) ?? [];
    group.push(link);
    groups.set(url, group);
  }
  return [...groups.values()].map((group) => {
    const title = group.find((item) => item.title.trim())?.title ?? "";
    return { id: group[0].id, url: canonicalTaskLinkUrl(group[0].url), title, ids: group.map((item) => item.id) };
  });
}
