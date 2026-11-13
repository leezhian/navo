import type { TraceEvent } from "@/shared/extensionTypes";
import { earliestByRound, type RoundStart } from "./timelineRounds";

/** 时间线横轴。默认等宽记录；打开时长后按实际耗时排列，并去掉空等。 */
export type TimelineProjectionMode = "sequence" | "duration";

/** 等宽记录再放大就会分不清相邻操作，窗口至少保留大约四格。 */
export const TIMELINE_MIN_SEQUENCE_SLOTS = 4;

export interface TimelineSpan {
  id: number;
  /** 投影坐标起点，含。等宽记录是槽位下标，时间投影是毫秒。 */
  start: number;
  /** 投影坐标终点。等宽记录是下一格，时长模式是扣除空等后的结束时刻。 */
  end: number;
}

export interface TimelineProjection {
  start: number;
  end: number;
  spans: TimelineSpan[];
  /** 轮次 ≥ 1 的竖线。位置是该轮各块投影起点的最小值，所以空等被去掉后竖线仍落在块上。 */
  rounds: RoundStart[];
}

interface TimedEvent {
  id: number;
  round: number;
  start: number;
  end: number;
}

function timedEvents(events: TraceEvent[]): TimedEvent[] {
  const timed: TimedEvent[] = [];
  for (const event of events) {
    if (!event.timestamp) continue;
    const start = Date.parse(event.timestamp);
    if (!Number.isFinite(start)) continue;
    const duration = Math.max(0, event.durationMs ?? 0);
    timed.push({ id: event.id, round: event.round, start, end: start + duration });
  }
  return timed;
}

/** 竖线取该轮投影起点的最小值。等宽记录的槽位随记录递增，所以这就是该轮第一条；时长模式则是最早时刻被压缩进时间轴后的位置。 */
function roundMarks(events: TimedEvent[], spans: TimelineSpan[]): RoundStart[] {
  const atById = new Map(spans.map((span) => [span.id, span.start]));
  return earliestByRound(
    events.flatMap((event) => {
      const at = atById.get(event.id);
      return at == null ? [] : [{ round: event.round, at }];
    }),
  );
}

function projectSequence(events: TimedEvent[]): TimelineProjection {
  const spans = events.map((event, index) => ({
    id: event.id,
    start: index,
    end: index + 1,
  }));
  return { start: 0, end: spans.length, spans, rounds: roundMarks(events, spans) };
}

function projectDuration(events: TimedEvent[]): TimelineProjection {
  // 空等按时间顺序扣除。记录顺序不是时间顺序，Grok 的工具开始时间可能早于排在它前面的事件。
  const removedIdle = new Map<number, number>();
  let removed = 0;
  let coveredUntil: number | null = null;
  const ordered = [...events].sort((left, right) => left.start - right.start || left.end - right.end);
  for (const span of ordered) {
    if (coveredUntil !== null && span.start > coveredUntil) removed += span.start - coveredUntil;
    removedIdle.set(span.id, removed);
    coveredUntil = coveredUntil === null ? span.end : Math.max(coveredUntil, span.end);
  }
  const spans = events.map((span) => {
    const offset = removedIdle.get(span.id) ?? 0;
    return { id: span.id, start: span.start - offset, end: span.end - offset };
  });
  return {
    start: Math.min(...spans.map((span) => span.start)),
    end: Math.max(...spans.map((span) => span.end)),
    spans,
    rounds: roundMarks(events, spans),
  };
}

/** 没有可用时间戳时返回 null，时间线整段隐藏。无时间的事件不占槽位。 */
export function projectTimeline(events: TraceEvent[], mode: TimelineProjectionMode): TimelineProjection | null {
  const timed = timedEvents(events);
  if (!timed.length) return null;
  if (mode === "sequence") return projectSequence(timed);
  return projectDuration(timed);
}

/**
 * 与选区重叠的事件，保持记录顺序。
 * 有宽度的区间是半开的 [start, end)：选区起点正好落在边界上时不算上一格，避免等宽记录滚到前一条。
 * 没有宽度的时刻仍算闭区间，贴住选区端点也命中。
 */
export function spansOverlapping(spans: TimelineSpan[], start: number, end: number): number[] {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  return spans
    .filter((span) => (span.end > span.start ? span.start < to && span.end > from : span.start >= from && span.start <= to))
    .map((span) => span.id);
}
