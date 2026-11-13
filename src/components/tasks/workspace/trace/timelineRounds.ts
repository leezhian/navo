import type { TraceEvent } from "@/shared/extensionTypes";

/** 合并阈值：两条轮次竖线相距小于该像素时只画一条。 */
export const ROUND_MERGE_PX = 4;

/** 一轮竖线在合并前的位置。at 的单位跟当前投影一致。 */
export interface RoundStart {
  round: number;
  at: number;
}

export interface RoundMark {
  /** 合并后的起止轮次；未合并时两者相同。 */
  from: number;
  to: number;
  /** 该组竖线的坐标，取组内最靠左的一条。时间投影里是毫秒，等宽记录里是槽位。 */
  at: number;
}

/** 同一轮只留最小坐标。轮次 0 不画线。 */
export function earliestByRound(items: Array<{ round: number; at: number }>): RoundStart[] {
  const seen = new Map<number, number>();
  for (const item of items) {
    if (item.round < 1 || !Number.isFinite(item.at)) continue;
    const current = seen.get(item.round);
    if (current == null || item.at < current) seen.set(item.round, item.at);
  }
  return [...seen].map(([round, at]) => ({ round, at }));
}

/**
 * 每轮竖线取该轮带时间事件里最早的时刻。
 * 记录顺序不是时间顺序：Grok 的工具开始时间由完成时间减去耗时倒推，可能早于同一轮里排在它前面的事件；按记录顺序取第一条会把竖线画到这一轮自己的块右边。
 * 轮次 0 是首条用户输入之前的记录，不计入统计栏的轮次，也不画线；没有带时间事件的轮次不画线，不按相邻轮次估算。
 */
export function roundStarts(events: TraceEvent[]): RoundStart[] {
  const points: Array<{ round: number; at: number }> = [];
  for (const event of events) {
    if (!event.timestamp) continue;
    const at = Date.parse(event.timestamp);
    if (!Number.isFinite(at)) continue;
    points.push({ round: event.round, at });
  }
  return earliestByRound(points);
}

/** 按像素位置从左到右合并：与上一条已画竖线相距小于 minGap 的并入同一组。 */
export function mergeRoundMarks(
  starts: RoundStart[],
  start: number,
  total: number,
  width: number,
  minGap = ROUND_MERGE_PX,
): RoundMark[] {
  if (width <= 0 || total <= 0) return [];
  const marks: RoundMark[] = [];
  let lastX = -Infinity;
  for (const item of [...starts].sort((a, b) => a.at - b.at || a.round - b.round)) {
    const x = ((item.at - start) / total) * width;
    const previous = marks[marks.length - 1];
    if (previous && x - lastX < minGap) {
      previous.from = Math.min(previous.from, item.round);
      previous.to = Math.max(previous.to, item.round);
      continue;
    }
    marks.push({ from: item.round, to: item.round, at: item.at });
    lastX = x;
  }
  return marks;
}

