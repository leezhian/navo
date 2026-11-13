import type { TraceEvent } from "@/shared/extensionTypes";
import { spansOverlapping, type TimelineSpan } from "./timelineProjection";
import { eventInBrush, expandDomainRange } from "./traceRange";
import { edgePanTimelineViewport, panTimelineViewport, timelineWindow, type TimelineViewport } from "./timelineViewport";
import type { TraceRange } from "./useTraceData";

/** 移动不足这么多像素时仍算点击或右键单击，不框选、也不平移。 */
export const DRAG_THRESHOLD_PX = 3;

export interface AxisGesture {
  fullStart: number;
  fullEnd: number;
  viewport: TimelineViewport | null;
  /** 等宽记录用槽位下限，时间投影用毫秒下限。滚轮回调读这里，避免闭包停在切换前的投影。 */
  minDuration: number;
}

export interface DragSession {
  pointerId: number;
  startX: number;
  /** 按下时的投影坐标。框选过程中窗口可能平移，起点不再按像素重算。 */
  startTime: number;
  moved: boolean;
}

export interface PanSession {
  pointerId: number;
  anchorClientX: number;
  anchorStart: number;
  duration: number;
  moved: boolean;
  /** 按下时窗口是否已经放大。未放大时右键拖动不平移。 */
  pannable: boolean;
}

interface AxisRect {
  left: number;
  width: number;
}

export function timeAt(clientX: number, rect: AxisRect, start: number, total: number) {
  const ratio = Math.min(1, Math.max(0, rect.width ? (clientX - rect.left) / rect.width : 0));
  return start + ratio * total;
}

/** 框选对象只留墙上时间，供范围对象保持有效。置灰和滚动都看 ids，不看这里。 */
export function brushStamp(events: TraceEvent[], ids: number[]): { from: string; to: string } {
  const hits = new Set(ids);
  const times = events.flatMap((event) => {
    if (!hits.has(event.id) || !event.timestamp) return [];
    const start = Date.parse(event.timestamp);
    if (!Number.isFinite(start)) return [];
    return [start, start + Math.max(0, event.durationMs ?? 0)];
  });
  if (!times.length) {
    const fallback = events.find((event) => event.timestamp)?.timestamp ?? new Date(0).toISOString();
    return { from: fallback, to: fallback };
  }
  return { from: new Date(Math.min(...times)).toISOString(), to: new Date(Math.max(...times)).toISOString() };
}

/** 轴线在按下时捕获了指针，松开时 event.target 可能是轴线本身，要用坐标回查块。 */
export function markFromPointer(clientX: number, clientY: number, target: EventTarget | null, axis: HTMLElement) {
  const fromTarget = target instanceof Element ? target.closest("button[data-event-id]") : null;
  if (fromTarget instanceof HTMLElement && axis.contains(fromTarget)) return fromTarget;
  for (const node of document.elementsFromPoint(clientX, clientY)) {
    if (node instanceof HTMLElement && axis.contains(node) && node.matches("button[data-event-id]")) return node;
  }
  return null;
}

export function swallowFollowingClick(suppressClick: { current: boolean }) {
  // 只吞掉这次指针操作结束后的 click。拖动或在松开时已经处理过选中，避免按钮 onClick 再触发一次。
  suppressClick.current = true;
  setTimeout(() => {
    suppressClick.current = false;
  }, 0);
}

/** 右键准备平移，左键准备点击或框选。其他按键不捕获指针。 */
export function beginAxisPointer(
  button: number,
  pointerId: number,
  clientX: number,
  rect: AxisRect,
  gesture: AxisGesture,
): { kind: "pan"; session: PanSession } | { kind: "drag"; session: DragSession } | { kind: "ignore" } {
  if (button === 2) {
    const shown = timelineWindow(gesture.fullStart, gesture.fullEnd, gesture.viewport);
    return {
      kind: "pan",
      session: {
        pointerId,
        anchorClientX: clientX,
        anchorStart: shown.start,
        duration: shown.duration,
        moved: false,
        pannable: gesture.viewport !== null,
      },
    };
  }
  if (button !== 0) return { kind: "ignore" };
  const shown = timelineWindow(gesture.fullStart, gesture.fullEnd, gesture.viewport);
  return {
    kind: "drag",
    session: {
      pointerId,
      startX: clientX,
      startTime: timeAt(clientX, rect, shown.start, shown.duration),
      moved: false,
    },
  };
}

/**
 * 右键移动。不足 3px 时不改窗口，松开仍按单击取消框选。
 * 超过阈值后按从按下点算起的整段位移平移，内容跟着指针，不会先空走这 3px。
 * 返回 undefined 表示窗口不动：还没超过阈值，或者按下时还没放大。
 */
export function panFromPointer(
  session: PanSession,
  clientX: number,
  width: number,
  fullStart: number,
  fullEnd: number,
): TimelineViewport | undefined {
  const delta = clientX - session.anchorClientX;
  if (Math.abs(delta) < DRAG_THRESHOLD_PX) return undefined;
  session.moved = true;
  if (!session.pannable) return undefined;
  return panTimelineViewport(fullStart, fullEnd, session.anchorStart, session.duration, delta, width);
}

/** 松开时位移已经达到拖动阈值，即使中间没收到移动事件，也不当成单击。 */
export function panEndedAsDrag(session: PanSession, clientX: number) {
  return session.moved || Math.abs(clientX - session.anchorClientX) >= DRAG_THRESHOLD_PX;
}

/**
 * 左键拖动中的选区。不足阈值时返回 null，仍按点击处理。
 * 已经放大且指针停在左右边缘时推动窗口；选区起点保持按下时的坐标。
 */
export function brushDraftFromPointer(
  session: DragSession,
  clientX: number,
  rect: AxisRect,
  fullStart: number,
  fullEnd: number,
  gesture: AxisGesture,
): { draft: { from: number; to: number }; viewport: TimelineViewport | null } | null {
  if (!session.moved && Math.abs(clientX - session.startX) <= DRAG_THRESHOLD_PX) return null;
  session.moved = true;
  const shown = timelineWindow(gesture.fullStart, gesture.fullEnd, gesture.viewport);
  let windowStart = shown.start;
  let windowDuration = shown.duration;
  let viewport = gesture.viewport;
  if (viewport) {
    const next = edgePanTimelineViewport(fullStart, fullEnd, viewport, clientX - rect.left, rect.width);
    if (next !== viewport) {
      viewport = next;
      windowStart = next.start;
      windowDuration = Math.max(1, next.end - next.start);
    }
  }
  return { viewport, draft: { from: session.startTime, to: timeAt(clientX, rect, windowStart, windowDuration) } };
}

/** 松开时把拖动收成框选。没超过阈值返回 null，调用方按点击处理。 */
export function committedBrush(
  session: DragSession,
  clientX: number,
  rect: AxisRect,
  gesture: AxisGesture,
  spans: TimelineSpan[],
  events: TraceEvent[],
): { brush: { from: number; to: number }; range: TraceRange } | null {
  if (!session.moved) return null;
  const shown = timelineWindow(gesture.fullStart, gesture.fullEnd, gesture.viewport);
  const selected = expandDomainRange(
    session.startTime,
    timeAt(clientX, rect, shown.start, shown.duration),
    gesture.fullStart,
    gesture.fullEnd,
    rect.width,
    shown.duration,
  );
  const ids = spansOverlapping(spans, selected.start, selected.end);
  return { brush: { from: selected.start, to: selected.end }, range: { ...brushStamp(events, ids), ids } };
}

export type AxisClick = { type: "clear" } | { type: "select"; id: number } | { type: "ignore" };

/** 点在选区外的块上只取消框选。没有块则取消框选。块上的序号无法解析时不动选中。 */
export function resolveAxisClick(mark: HTMLElement | null, events: TraceEvent[], range: TraceRange | null | undefined): AxisClick {
  if (!mark) return { type: "clear" };
  const id = Number(mark.dataset.eventId);
  const item = events.find((entry) => entry.id === id);
  if (range && item && !eventInBrush(item, range)) return { type: "clear" };
  if (Number.isFinite(id)) return { type: "select", id };
  return { type: "ignore" };
}
