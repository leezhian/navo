import type { TraceQuery } from "@/shared/extensionTypes";

export interface ScrollPosition {
  top: number;
  left: number;
}
export interface TraceReadingPosition {
  /** 记录稳定事件 ID；尚无匹配结果时只保存查询条件，不伪造事件锚点。 */
  eventId?: number;
  offset: number;
  filter: TraceQuery["filter"];
  search: string;
  showBookkeeping?: boolean;
  follow: boolean;
}

const MAX_ENTRIES = 500;
const scrollPositions = new Map<string, ScrollPosition>();
const tracePositions = new Map<string, TraceReadingPosition>();

/** 只在当前窗口记忆位置，不写磁盘或保存正文；限制条数避免长期浏览累积。 */
function remember<T>(cache: Map<string, T>, key: string, value: T) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
}

export function readingPositionKey(...parts: string[]) { return JSON.stringify(parts); }
export function readScrollPosition(key: string) { return scrollPositions.get(key); }
export function writeScrollPosition(key: string, position: ScrollPosition) { remember(scrollPositions, key, position); }
export function readTraceReadingPosition(key?: string) { return key ? tracePositions.get(key) : undefined; }
export function writeTraceReadingPosition(key: string, position: TraceReadingPosition) { remember(tracePositions, key, position); }
