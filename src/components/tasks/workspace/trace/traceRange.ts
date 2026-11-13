import type { TraceEvent, TracePage, TraceStats } from "@/shared/extensionTypes";

/** 已加载的连续事件窗口；列表按 total 预留全部高度，滚到未加载区域时再取对应窗口。 */
export interface TraceWindow {
  offset: number;
  events: TraceEvent[];
  total: number;
  stats: TraceStats;
}

const MIN_MARK_RATIO = 0.005;
const MIN_MARK_PX = 3;

/** 事件是否落入框选时间段：有持续时间按闭区间重叠，仅有时间戳则时刻需落在闭区间内；无时间戳一律算段外。 */
export function eventOverlapsRange(event: Pick<TraceEvent, "timestamp" | "durationMs">, from: string, to: string): boolean {
  if (!event.timestamp) return false;
  const start = Date.parse(event.timestamp),
    rangeStart = Date.parse(from),
    rangeEnd = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) return false;
  if (event.durationMs != null) return start <= rangeEnd && start + event.durationMs >= rangeStart;
  return start >= rangeStart && start <= rangeEnd;
}

/**
 * 框选命中。ids 在场时（含空数组）只认投影命中的事件，不再用墙上时间：
 * 等宽记录里，起得很早的长工具不该因为持续时间跨进后面的格子而被算进选区。
 * 空数组表示选区没有落到任何事件。没有 ids 时仍按墙上时间重叠，供只持有时间段的调用使用。
 */
export function eventInBrush(
  event: Pick<TraceEvent, "id" | "timestamp" | "durationMs">,
  range: { from: string; to: string; ids?: number[] },
): boolean {
  if (range.ids) return range.ids.includes(event.id);
  return eventOverlapsRange(event, range.from, range.to);
}

/**
 * 把过窄的拖选扩到最小宽度，且不超出投影整段。返回投影坐标。
 * 等宽记录的坐标是槽位，不能当成毫秒去转 ISO，也不能传给按时间过滤的查询。
 * scaleDuration 是屏幕上当前窗口的跨度。放大后按可见窗算最小宽度，夹紧仍用整段起止，边缘平移带进来的选区不会被裁回窗口。
 */
export function expandDomainRange(
  from: number,
  to: number,
  axisStart: number,
  axisEnd: number,
  axisWidthPx: number,
  scaleDuration?: number,
): { start: number; end: number } {
  const bounds = Math.max(1, axisEnd - axisStart);
  const minSpan = Math.max(MIN_MARK_PX / Math.max(axisWidthPx, 1), MIN_MARK_RATIO) * Math.max(1, scaleDuration ?? bounds);
  let start = Math.min(from, to),
    end = Math.max(from, to);
  if (end - start < minSpan) {
    const mid = (start + end) / 2;
    start = mid - minSpan / 2;
    end = mid + minSpan / 2;
  }
  if (start < axisStart) {
    end = Math.min(axisEnd, end + (axisStart - start));
    start = axisStart;
  }
  if (end > axisEnd) {
    start = Math.max(axisStart, start - (end - axisEnd));
    end = axisEnd;
  }
  return { start, end };
}

/**
 * 把过窄的拖选扩展到事件块最小宽度，且不超出时间轴起止，再换成 ISO。
 * scaleDurationMs 是屏幕上当前时间窗的时长。只适用于毫秒坐标；槽位坐标用 expandDomainRange。
 */
export function expandTimelineRange(
  fromMs: number,
  toMs: number,
  axisStart: number,
  axisEnd: number,
  axisWidthPx: number,
  scaleDurationMs?: number,
): { from: string; to: string } {
  const range = expandDomainRange(fromMs, toMs, axisStart, axisEnd, axisWidthPx, scaleDurationMs);
  return { from: new Date(range.start).toISOString(), to: new Date(range.end).toISOString() };
}

/** 把新取到的窗口并入已加载的连续区间；不相邻时改用新窗口，避免列表出现空洞。 */
export function mergeTraceWindows(current: TraceWindow | null, page: TracePage, offset: number): TraceWindow {
  const incoming: TraceWindow = {
    offset,
    events: page.events,
    total: page.total,
    stats: page.stats,
  };
  if (!current) return incoming;
  const currentEnd = current.offset + current.events.length,
    pageEnd = offset + page.events.length;
  if (pageEnd < current.offset || offset > currentEnd) return incoming;
  const start = Math.min(current.offset, offset),
    end = Math.max(currentEnd, pageEnd);
  const events: TraceEvent[] = [];
  for (let index = start; index < end; index++) {
    if (index >= offset && index < pageEnd) events.push(page.events[index - offset]);
    else events.push(current.events[index - current.offset]);
  }
  const clipped = start + events.length > page.total ? events.slice(0, Math.max(0, page.total - start)) : events;
  return { offset: start, events: clipped, total: page.total, stats: page.stats };
}


/** 计算可视范围（全量结果中的绝对下标）前后各 padWindows 窗需要对齐加载的 offset 列表。 */
export function visibleWindowOffsets(total: number, firstIndex: number, lastIndex: number, windowSize: number, padWindows = 1): number[] {
  if (windowSize < 1 || total < 1) return [0];
  const last = Math.min(total - 1, Math.max(0, firstIndex, lastIndex));
  const first = Math.min(last, Math.max(0, firstIndex));
  const start = Math.max(0, (Math.floor(first / windowSize) - padWindows) * windowSize);
  const end = Math.min(total, (Math.floor(last / windowSize) + 1 + padWindows) * windowSize);
  const offsets: number[] = [];
  for (let offset = start; offset < end; offset += windowSize) offsets.push(offset);
  return offsets.length ? offsets : [0];
}

/** 末尾 count 个对齐窗口的 offset，用于首次打开和筛选变化后停在最新事件。 */
export function tailWindowOffsets(total: number, windowSize: number, count = 2): number[] {
  if (total < 1 || windowSize < 1) return [0];
  const last = Math.floor((total - 1) / windowSize) * windowSize;
  const offsets: number[] = [];
  for (let offset = Math.max(0, last - (count - 1) * windowSize); offset <= last; offset += windowSize) offsets.push(offset);
  return offsets;
}
