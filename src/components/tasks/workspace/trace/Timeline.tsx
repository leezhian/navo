import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { TraceEvent, TraceKind } from "@/shared/extensionTypes";
import { timelineHoverText } from "./formatTraceDuration";
import { eventInBrush } from "./traceRange";
import { traceKindTone } from "./traceKind";
import { mergeRoundMarks } from "./timelineRounds";
import {
  projectTimeline,
  TIMELINE_MIN_SEQUENCE_SLOTS,
  type TimelineProjectionMode,
  type TimelineSpan,
} from "./timelineProjection";
import {
  applyTimelineWheel,
  clampTimelineViewport,
  intersectsTimelineWindow,
  revealTimelineViewport,
  TIMELINE_MIN_VIEWPORT_MS,
  timelineWindow,
  type TimelineViewport,
} from "./timelineViewport";
import {
  beginAxisPointer,
  brushDraftFromPointer,
  committedBrush,
  markFromPointer,
  panEndedAsDrag,
  panFromPointer,
  resolveAxisClick,
  swallowFollowingClick,
  type AxisGesture,
  type DragSession,
  type PanSession,
} from "./timelineAxisPointer";
import type { TraceRange } from "./useTraceData";
import { cn } from "@/lib/utils";

interface TimelineProps {
  /** 已记录时间的事件；缺少耗时时显示时间标记，不补造持续时长。无时间的事件不进入投影。 */
  events: TraceEvent[];
  /** 超过时间线数量上限时提示用户，列表仍可查看完整记录。 */
  truncated: boolean;
  /** 当前在列表或详情中选中的事件；时间线同步高亮。已放大且该事件不在窗口内时，只平移窗口。 */
  selectedId: number | null;
  /** 已应用的框选；投影未命中的块置灰。框选不收窄时间线，缩放窗口另算。 */
  range?: TraceRange | null;
  /** 点击事件块后定位并在右侧打开详情；再次点击同一块则取消选中。拖动框选时不会触发。 */
  onSelect: (id: number) => void;
  /** 拖动超过 3px 后松开。命中按当前投影计算，列表滚到其中仍在当前筛选里的第一条。 */
  onRangeSelect: (range: TraceRange) => void;
  /** 按 Esc、双击时间线、单击空白处，或点选区外的块时取消框选。不恢复缩放。 */
  onRangeClear: () => void;
  /** 为真时按实际耗时排列并压缩空等。开关在统计行，切换时由外层取消框选。 */
  actualDuration: boolean;
}

function rangeStyle(from: number, to: number, start: number, total: number) {
  const left = ((Math.min(from, to) - start) / total) * 100;
  const right = ((Math.max(from, to) - start) / total) * 100;
  return { left: `${Math.max(0, left)}%`, width: `${Math.max(0, Math.min(100, right) - Math.max(0, left))}%` };
}

/** 块相对当前窗口定位，两侧各留 1px，避免相邻记录连成一片。 */
function spanStyle(span: TimelineSpan, origin: number, duration: number) {
  const left = ((span.start - origin) / duration) * 100;
  const width = ((span.end - span.start) / duration) * 100;
  return { left: `calc(${left}% + 1px)`, width: `max(2px, calc(${width}% - 2px))` };
}

export function Timeline({ events, truncated, selectedId, range, onSelect, onRangeSelect, onRangeClear, actualDuration }: TimelineProps) {
  const { t } = useTranslation(["trace"]);
  const rootRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragSession | null>(null);
  const pan = useRef<PanSession | null>(null);
  const suppressClick = useRef(false);
  const revealedSelection = useRef<number | null>(null);
  const gesture = useRef<AxisGesture>({ fullStart: 0, fullEnd: 0, viewport: null, minDuration: TIMELINE_MIN_VIEWPORT_MS });
  const [draft, setDraft] = useState<{ from: number; to: number } | null>(null);
  const [brush, setBrush] = useState<{ from: number; to: number } | null>(null);
  const [viewport, setViewport] = useState<TimelineViewport | null>(null);
  const [panning, setPanning] = useState(false);
  const [trackedDuration, setTrackedDuration] = useState(actualDuration);
  // 时长开关在统计行。变化时先恢复铺满，再按新投影绘制，避免旧窗口的坐标套到另一种轴上。
  if (trackedDuration !== actualDuration) {
    setTrackedDuration(actualDuration);
    setViewport(null);
    setBrush(null);
  }
  const mode: TimelineProjectionMode = actualDuration ? "duration" : "sequence";
  const projection = useMemo(() => projectTimeline(events, mode), [events, mode]);
  const hasAxis = projection != null;
  const fullStart = projection?.start ?? 0;
  const fullEnd = projection?.end ?? 0;
  const active = clampTimelineViewport(fullStart, fullEnd, viewport);
  const visible = timelineWindow(fullStart, fullEnd, active);
  const minDuration = mode === "sequence" ? TIMELINE_MIN_SEQUENCE_SLOTS : TIMELINE_MIN_VIEWPORT_MS;
  gesture.current.fullStart = fullStart;
  gesture.current.fullEnd = fullEnd;
  gesture.current.viewport = active;
  gesture.current.minDuration = minDuration;
  // 轮次竖线按像素合并，需要知道轴线实际宽度。
  const [axisWidth, setAxisWidth] = useState(0);
  useEffect(() => {
    const axis = axisRef.current;
    if (!hasAxis || !axis) return;
    const update = () => setAxisWidth(axis.clientWidth);
    const observer = new ResizeObserver(update);
    observer.observe(axis);
    update();
    return () => observer.disconnect();
  }, [hasAxis]);
  useEffect(() => {
    const root = rootRef.current;
    if (!hasAxis || !root) return;
    const onWheel = (event: WheelEvent) => {
      // 滚轮、双指上下滑、双指张开和左右滑都走 wheel。必须拦住默认行为，否则触控板会把页面缩放或把列表滚走。
      event.preventDefault();
      const axis = axisRef.current;
      if (!axis) return;
      const rect = axis.getBoundingClientRect();
      const fraction = rect.width ? (event.clientX - rect.left) / rect.width : 0;
      const { fullStart: start, fullEnd: end, minDuration: floor } = gesture.current;
      setViewport((current) => {
        const next = applyTimelineWheel(start, end, current, {
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          ctrlKey: event.ctrlKey,
          anchorFraction: fraction,
          widthPx: rect.width,
          minDuration: floor,
        });
        gesture.current.viewport = next;
        return next;
      });
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [hasAxis]);
  useEffect(() => {
    setViewport((current) => clampTimelineViewport(fullStart, fullEnd, current));
  }, [fullStart, fullEnd]);
  useEffect(() => {
    if (selectedId == null) {
      revealedSelection.current = null;
      return;
    }
    if (revealedSelection.current === selectedId) return;
    const span = projection?.spans.find((item) => item.id === selectedId);
    if (!span) return;
    revealedSelection.current = selectedId;
    setViewport((current) => {
      const fitted = clampTimelineViewport(fullStart, fullEnd, current);
      if (!fitted) return fitted;
      return revealTimelineViewport(fullStart, fullEnd, fitted, span.start, span.end);
    });
  }, [selectedId, projection, fullStart, fullEnd]);
  useEffect(() => {
    if (!range) setBrush(null);
  }, [range]);
  // 整段无时间的提示由外层给出；部分有时间或仍在读取时不另做空状态。
  if (!projection) return null;
  // 收窄后的投影交给后面的指针回调。闭包里不能继续用可能为空的那个绑定。
  const axisModel = projection;
  const spanById = new Map(axisModel.spans.map((span) => [span.id, span]));
  // 压缩和未知也占一格。不画出来的话，等宽记录里会空出一格，看起来像丢了事件。
  const lanes: Array<{ label: string; kinds: TraceKind[] }> = [
    { label: t("trace:input"), kinds: ["user", "context", "system", "compaction", "unknown"] },
    { label: t("trace:model"), kinds: ["assistant", "reasoning"] },
    { label: t("trace:tools"), kinds: ["tool", "error"] },
  ];
  const highlight = draft ?? (range ? brush : null);
  const windowEnd = visible.start + visible.duration;
  // 先丢掉窗口外的轮次，再按可见宽度合并，避免窗口外的线把窗口内第一条并掉。
  const roundMarks = mergeRoundMarks(
    axisModel.rounds.filter((item) => intersectsTimelineWindow(item.at, 0, visible.start, windowEnd)),
    visible.start,
    visible.duration,
    axisWidth,
  );
  function finishPointer(event: ReactPointerEvent<HTMLDivElement>, commit: boolean) {
    const session = drag.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const axis = axisRef.current;
    if (axis?.hasPointerCapture(event.pointerId)) axis.releasePointerCapture(event.pointerId);
    drag.current = null;
    setDraft(null);
    if (!commit || !axis) return;
    // 捕获指针后 click 不一定落到块上，在松开时按坐标命中并直接定位。
    swallowFollowingClick(suppressClick);
    const rect = axis.getBoundingClientRect();
    const committed = committedBrush(session, event.clientX, rect, gesture.current, axisModel.spans, events);
    if (committed) {
      setBrush(committed.brush);
      onRangeSelect(committed.range);
      return;
    }
    const click = resolveAxisClick(markFromPointer(event.clientX, event.clientY, event.target, axis), events, range);
    if (click.type === "select") onSelect(click.id);
    else if (click.type === "clear") onRangeClear();
  }
  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    const session = pan.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const dragged = panEndedAsDrag(session, event.clientX);
    pan.current = null;
    setPanning(false);
    if (axisRef.current?.hasPointerCapture(event.pointerId)) axisRef.current.releasePointerCapture(event.pointerId);
    if (!dragged) onRangeClear();
  }
  function startAxisPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const axis = axisRef.current;
    if (!axis) return;
    if (event.button === 2) event.preventDefault();
    const next = beginAxisPointer(event.button, event.pointerId, event.clientX, axis.getBoundingClientRect(), gesture.current);
    if (next.kind === "ignore") return;
    if (next.kind === "pan") {
      pan.current = next.session;
      if (next.session.pannable) setPanning(true);
    } else {
      suppressClick.current = false;
      drag.current = next.session;
    }
    axis.setPointerCapture(event.pointerId);
  }
  function moveAxisPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const axis = axisRef.current;
    const panningSession = pan.current;
    if (panningSession && panningSession.pointerId === event.pointerId) {
      if (!axis) return;
      const next = panFromPointer(panningSession, event.clientX, axis.getBoundingClientRect().width, gesture.current.fullStart, gesture.current.fullEnd);
      if (!next) return;
      gesture.current.viewport = next;
      setViewport(next);
      return;
    }
    const session = drag.current;
    if (!session || session.pointerId !== event.pointerId || !axis) return;
    const update = brushDraftFromPointer(session, event.clientX, axis.getBoundingClientRect(), gesture.current.fullStart, gesture.current.fullEnd, gesture.current);
    if (!update) return;
    if (update.viewport !== gesture.current.viewport) {
      gesture.current.viewport = update.viewport;
      setViewport(update.viewport);
    }
    setDraft(update.draft);
  }
  function cancelAxisPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (pan.current?.pointerId === event.pointerId) {
      pan.current = null;
      setPanning(false);
      if (axisRef.current?.hasPointerCapture(event.pointerId)) axisRef.current.releasePointerCapture(event.pointerId);
      return;
    }
    finishPointer(event, false);
  }
  function loseAxisPointer(event: ReactPointerEvent<HTMLDivElement>) {
    // 右键被系统拿走时 pointerup 可能不来。只结束平移，不碰左键框选，避免松开时选区被一起丢掉。
    if (pan.current?.pointerId !== event.pointerId) return;
    pan.current = null;
    setPanning(false);
  }
  return (
    <div
      ref={rootRef}
      data-axis-mode={mode}
      className="timeline shrink-0 overscroll-none px-3 pb-2 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Escape" && range) {
          event.preventDefault();
          onRangeClear();
        }
      }}
      onDoubleClick={onRangeClear}
    >
      <div className="flex gap-2">
        <div className="flex w-10 shrink-0 flex-col">
          {lanes.map((lane) => (
            <div className="flex h-4 items-center" key={lane.label}>
              <span className="truncate text-[10px] text-[color-mix(in_oklch,var(--muted-foreground)_80%,white)]">{lane.label}</span>
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            ref={axisRef}
            className={cn("relative touch-none select-none overflow-hidden overscroll-none", panning ? "cursor-grabbing" : "cursor-crosshair")}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDownCapture={(event) => {
              // macOS 在右键按下时就会进入菜单跟踪，不在捕获阶段取消默认行为的话，后续 pointermove 到不了轴线，平移不会发生。
              if (event.button === 2) event.preventDefault();
            }}
            onMouseDown={(event) => {
              if (event.button === 2) event.preventDefault();
            }}
            onPointerDown={startAxisPointer}
            onPointerMove={moveAxisPointer}
            onPointerUp={(event) => {
              if (pan.current?.pointerId === event.pointerId) {
                endPan(event);
                return;
              }
              finishPointer(event, true);
            }}
            onPointerCancel={cancelAxisPointer}
            onLostPointerCapture={loseAxisPointer}
          >
            {roundMarks.map((mark) => (
              <div
                key={mark.from}
                aria-hidden="true"
                data-round-line={mark.from === mark.to ? String(mark.from) : `${mark.from}-${mark.to}`}
                className="pointer-events-none absolute inset-y-0 z-0 w-px bg-border"
                style={{ left: `${((mark.at - visible.start) / visible.duration) * 100}%` }}
              />
            ))}
            {highlight && <div className="pointer-events-none absolute inset-y-0 z-[1] bg-ring/20" style={rangeStyle(highlight.from, highlight.to, visible.start, visible.duration)} />}
            {lanes.map((lane) => (
              <div className="relative h-4" key={lane.label}>
                {events
                  .filter((event) => {
                    const span = spanById.get(event.id);
                    return Boolean(span && lane.kinds.includes(event.kind) && intersectsTimelineWindow(span.start, span.end - span.start, visible.start, windowEnd));
                  })
                  .map((item) => {
                    const span = spanById.get(item.id);
                    if (!span) return null;
                    const selected = item.id === selectedId;
                    const tone = traceKindTone(item.kind);
                    // 只有框选才置灰。点击选中只加高描边，不淡化其他块。选中块即使落在选区外也保持全亮。
                    const dimmed = Boolean(range && !selected && !eventInBrush(item, range));
                    const hover = timelineHoverText(item, t(`trace:kinds.${item.kind}`), t("trace:missing"), (ms) =>
                      t("trace:hover.total", { ms }),
                    );
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-kind={item.kind}
                        data-event-id={item.id}
                        aria-current={selected ? "true" : undefined}
                        data-dimmed={dimmed || undefined}
                        className={cn(
                          "absolute top-1 z-[2] h-2 min-w-[2px] max-w-full rounded-[1px] opacity-80 outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50",
                          dimmed && "opacity-20",
                          selected && cn("top-0.5 z-[3] h-3 opacity-100 outline outline-1", tone.outline),
                          tone.mark,
                        )}
                        style={spanStyle(span, visible.start, visible.duration)}
                        aria-label={hover}
                        title={hover}
                        onClick={(click) => {
                          if (suppressClick.current) {
                            click.preventDefault();
                            suppressClick.current = false;
                            return;
                          }
                          if (range && !eventInBrush(item, range)) {
                            onRangeClear();
                            return;
                          }
                          onSelect(item.id);
                        }}
                      />
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {truncated && <span>{t("trace:timelineClipped")}</span>}
    </div>
  );
}
