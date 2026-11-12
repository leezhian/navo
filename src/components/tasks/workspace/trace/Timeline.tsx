import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { TraceEvent, TraceKind } from "@/shared/extensionTypes";
import { eventOverlapsRange, expandTimelineRange } from "./traceRange";
import { traceKindTone } from "./traceKind";
import { cn } from "@/lib/utils";

const DRAG_THRESHOLD_PX = 3;

interface TimelineRange {
  /** 已应用的框选起止，ISO-8601。 */
  from: string;
  to: string;
}

interface TimelineProps {
  /** 已记录时间的事件；缺少耗时时显示时间标记，不补造持续时长。 */
  events: TraceEvent[];
  /** 超过时间线数量上限时提示用户，列表仍可查看完整记录。 */
  truncated: boolean;
  /** 当前在列表或详情中选中的事件；时间线同步高亮并淡化其他块，不在可视范围时滚到可见。 */
  selectedId: number | null;
  /** 已应用的时间范围；段外的块置灰，时间线本身仍展示完整会话。 */
  range?: TimelineRange | null;
  /** 点击事件块后定位并在右侧打开详情；再次点击同一块则取消选中。拖动框选时不会触发。 */
  onSelect: (id: number) => void;
  /** 拖动超过 3px 后松开，高亮该时间段并让列表滚到段内第一条。 */
  onRangeSelect: (from: string, to: string) => void;
  /** 按 Esc、双击时间线、单击空白处，或点选区外的块时取消框选。 */
  onRangeClear: () => void;
}

function timeAt(clientX: number, rect: DOMRect, start: number, total: number) {
  const ratio = Math.min(1, Math.max(0, rect.width ? (clientX - rect.left) / rect.width : 0));
  return start + ratio * total;
}

function rangeStyle(from: number, to: number, start: number, total: number) {
  const left = ((Math.min(from, to) - start) / total) * 100;
  const right = ((Math.max(from, to) - start) / total) * 100;
  return { left: `${Math.max(0, left)}%`, width: `${Math.max(0, Math.min(100, right) - Math.max(0, left))}%` };
}

/** 轴线在 pointerdown 时捕获了指针，松开时 event.target 可能是轴线本身，要用坐标回查块。 */
function markFromPointer(event: ReactPointerEvent, axis: HTMLElement) {
  const fromTarget = event.target instanceof Element ? event.target.closest("button[data-event-id]") : null;
  if (fromTarget instanceof HTMLElement && axis.contains(fromTarget)) return fromTarget;
  for (const node of document.elementsFromPoint(event.clientX, event.clientY)) {
    if (node instanceof HTMLElement && axis.contains(node) && node.matches("button[data-event-id]")) return node;
  }
  return null;
}

function swallowFollowingClick(suppressClick: { current: boolean }) {
  // 只吞掉这次指针操作结束后的 click；拖动或在 pointerup 里已经处理过选中时，避免按钮 onClick 再触发一次。
  suppressClick.current = true;
  setTimeout(() => {
    suppressClick.current = false;
  }, 0);
}

export function Timeline({ events, truncated, selectedId, range, onSelect, onRangeSelect, onRangeClear }: TimelineProps) {
  const { t } = useTranslation(["trace"]);
  const axisRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; startTime: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [draft, setDraft] = useState<{ from: number; to: number } | null>(null);
  const dates = events
    .flatMap((event) => (event.timestamp ? [Date.parse(event.timestamp), Date.parse(event.timestamp) + (event.durationMs ?? 0)] : []))
    .filter(Number.isFinite);
  useEffect(() => {
    if (selectedId == null || !axisRef.current) return;
    const mark = axisRef.current.querySelector(`[data-event-id="${selectedId}"]`);
    if (!(mark instanceof HTMLElement)) return;
    const container = axisRef.current;
    const markRect = mark.getBoundingClientRect(),
      rect = container.getBoundingClientRect();
    // 只滚动时间轴自身，避免 scrollIntoView 带动外层列表把选中行滚出视口。
    if (markRect.left < rect.left) container.scrollLeft += markRect.left - rect.left;
    else if (markRect.right > rect.right) container.scrollLeft += markRect.right - rect.right;
    if (markRect.top < rect.top) container.scrollTop += markRect.top - rect.top;
    else if (markRect.bottom > rect.bottom) container.scrollTop += markRect.bottom - rect.bottom;
  }, [selectedId, events]);
  // 整段无时间的提示由外层给出；部分有时间或仍在读取时不另做空状态。
  if (!dates.length) return null;
  const start = Math.min(...dates),
    end = Math.max(...dates),
    total = Math.max(1, end - start);
  const lanes: Array<{ label: string; kinds: TraceKind[] }> = [
    { label: t("trace:input"), kinds: ["user", "context", "system"] },
    { label: t("trace:model"), kinds: ["assistant", "reasoning"] },
    { label: t("trace:tools"), kinds: ["tool", "error"] },
  ];
  const applied =
    range && Number.isFinite(Date.parse(range.from)) && Number.isFinite(Date.parse(range.to))
      ? { from: Date.parse(range.from), to: Date.parse(range.to) }
      : null;
  const highlight = draft ?? applied;
  const hasSelectedMark = selectedId != null && events.some((event) => event.id === selectedId && event.timestamp);
  function finishPointer(event: ReactPointerEvent<HTMLDivElement>, commit: boolean) {
    const session = drag.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const axis = axisRef.current;
    if (axis?.hasPointerCapture(event.pointerId)) axis.releasePointerCapture(event.pointerId);
    drag.current = null;
    setDraft(null);
    if (!commit || !axis) return;
    if (session.moved) {
      swallowFollowingClick(suppressClick);
      const selected = expandTimelineRange(session.startTime, timeAt(event.clientX, axis.getBoundingClientRect(), start, total), start, end, axis.getBoundingClientRect().width);
      onRangeSelect(selected.from, selected.to);
      return;
    }
    // 捕获指针后 click 不一定落到块上，在松开时按坐标命中并直接定位。
    const mark = markFromPointer(event, axis);
    swallowFollowingClick(suppressClick);
    if (mark) {
      const id = Number(mark.dataset.eventId);
      const item = events.find((entry) => entry.id === id);
      if (range && item && !eventOverlapsRange(item, range.from, range.to)) {
        onRangeClear();
        return;
      }
      if (Number.isFinite(id)) onSelect(id);
      return;
    }
    onRangeClear();
  }
  return (
    <div
      className="timeline shrink-0 px-3 pb-2 text-[11px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
        <div className="flex w-9 shrink-0 flex-col">
          {lanes.map((lane) => (
            <div className="flex h-6 items-center" key={lane.label}>
              <span className="truncate">{lane.label}</span>
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            ref={axisRef}
            className="relative cursor-crosshair select-none"
            onPointerDown={(event) => {
              if (event.button !== 0 || !axisRef.current) return;
              const axis = axisRef.current;
              suppressClick.current = false;
              drag.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startTime: timeAt(event.clientX, axis.getBoundingClientRect(), start, total),
                moved: false,
              };
              axis.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const session = drag.current;
              if (!session || session.pointerId !== event.pointerId || !axisRef.current) return;
              if (!session.moved && Math.abs(event.clientX - session.startX) <= DRAG_THRESHOLD_PX) return;
              session.moved = true;
              setDraft({ from: session.startTime, to: timeAt(event.clientX, axisRef.current.getBoundingClientRect(), start, total) });
            }}
            onPointerUp={(event) => finishPointer(event, true)}
            onPointerCancel={(event) => finishPointer(event, false)}
          >
            {highlight && <div className="pointer-events-none absolute inset-y-0 z-[1] bg-ring/20" style={rangeStyle(highlight.from, highlight.to, start, total)} />}
            {lanes.map((lane) => (
              <div
                className="relative h-6"
                key={lane.label}
              >
                {events
                  .filter((event) => lane.kinds.includes(event.kind) && event.timestamp)
                  .map((item) => {
                    const selected = item.id === selectedId;
                    const tone = traceKindTone(item.kind);
                    // 有框选时段外置灰；只有选中时其余块淡化，让选中块更醒目。
                    const dimmed = applied && range ? !selected && !eventOverlapsRange(item, range.from, range.to) : hasSelectedMark && !selected;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-kind={item.kind}
                        data-event-id={item.id}
                        aria-current={selected ? "true" : undefined}
                        data-dimmed={dimmed || undefined}
                        className={cn(
                          "absolute top-1.5 z-[2] h-3 min-w-[3px] max-w-full rounded-[2px] opacity-60 outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50",
                          dimmed && "opacity-20",
                          selected && cn("top-1 z-[3] h-4 opacity-100 outline outline-1", tone.outline),
                          tone.mark,
                        )}
                        style={{
                          left: `${Math.min(99, ((Date.parse(item.timestamp ?? "") - start) / total) * 100)}%`,
                          width: `${Math.max(0.5, ((item.durationMs ?? 0) / total) * 100)}%`,
                        }}
                        aria-label={`${t(`trace:kinds.${item.kind}`)} · ${item.tool ?? item.preview}`}
                        title={`${item.tool ?? item.preview}\n${item.timestamp}${item.durationMs === undefined ? ` · ${t("trace:missing")}` : ` · ${item.durationMs}ms`}`}
                        onClick={(click) => {
                          if (suppressClick.current) {
                            click.preventDefault();
                            suppressClick.current = false;
                            return;
                          }
                          if (range && !eventOverlapsRange(item, range.from, range.to)) {
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
