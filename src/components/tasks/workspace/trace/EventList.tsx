import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TraceEvent } from "@/shared/extensionTypes";
import { cn } from "@/lib/utils";
import { formatTraceDuration } from "./formatTraceDuration";
import { traceKindTone } from "./traceKind";
import { eventOverlapsRange } from "./traceRange";
import type { TraceRange, TraceScrollTarget } from "./useTraceData";

/** 尚无已加载行时的占位行高；载入后按实际行高排版，并由滚动锚点抵消差值。 */
const ROW_ESTIMATE = 38;

interface EventRowLayout {
  key: string;
  top: number;
  height: number;
  heading?: string;
  event?: TraceEvent;
  /** 事件在全部结果中的绝对下标。 */
  index?: number;
}

function eventRowAt(rows: EventRowLayout[], scrollTop: number) {
  let match: EventRowLayout | undefined;
  for (const row of rows) {
    if (!row.event) continue;
    if (row.top <= scrollTop) match = row;
    else return match ?? row;
  }
  return match;
}

interface EventListProps {
  /** 已加载窗口内的事件摘要，正文在选择后单独读取。 */
  events: TraceEvent[];
  /** events[0] 在全部结果中的下标；上方未加载的行按估算高度留白。 */
  offset: number;
  /** 当前选中事件；null 表示不显示右侧详情。 */
  selected: number | null;
  /** 主动跟随时，在页面加载、追加和视口变化后保持最后一条事件可见。 */
  following: boolean;
  /** 选中或取消选中事件；选中时右侧显示详情，再次点击同一条则收起。 */
  onSelect: (id: number) => void;
  /** 叠加过滤后的结果总数；滚动高度按它预留，也用于空态判断。 */
  total: number;
  /** 框选时间段；段外的行置灰，不从列表移除。 */
  range: TraceRange | null;
  /** key 变化时滚到指定事件或最新一条。 */
  scrollTarget: TraceScrollTarget;
  /** 可视行在全部结果中的起止下标（含未加载的占位区域），用于按需取回窗口。 */
  onVisibleEvents?: (first: number, last: number) => void;
  /** 点击置灰行时只取消框选，不改变当前选中。 */
  onClearRange: () => void;
}
export function EventList({
  events,
  offset,
  selected,
  following,
  onSelect,
  total,
  range,
  scrollTarget,
  onVisibleEvents,
  onClearRange,
}: EventListProps) {
  const { t, i18n } = useTranslation(["trace"]);
  const scroller = useRef<HTMLDivElement>(null);
  const locatedSelection = useRef<number | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 500 });
  const { rows, estimate, loadedTop } = useMemo(() => {
    let top = 0,
      contentHeight = 0,
      round = -1,
      request: string | undefined;
    const layout = events.flatMap((event, position) => {
      const result: EventRowLayout[] = [];
      if (event.round !== round || (event.request && event.request !== request)) {
        const heading = event.request
          ? t("trace:requestGroup", { round: event.round, request: event.request.slice(-8) })
          : t("trace:group", { round: event.round });
        result.push({ key: `heading-${event.id}`, heading, top, height: 30 });
        top += 30;
        contentHeight += 30;
        round = event.round;
        request = event.request;
      }
      result.push({ key: `event-${event.id}`, event, index: offset + position, top, height: 38 });
      top += 38;
      contentHeight += 38;
      return result;
    });
    // 占位行高取已加载行的平均值（含分组标题），减少载入后的高度差。
    const rowEstimate = events.length ? contentHeight / events.length : ROW_ESTIMATE;
    const shift = offset * rowEstimate;
    for (const row of layout) row.top += shift;
    return { rows: layout, estimate: rowEstimate, loadedTop: shift };
  }, [events, offset, t]);
  const loadedBottom = rows.length ? rows[rows.length - 1].top + rows[rows.length - 1].height : loadedTop;
  const below = Math.max(0, total - offset - events.length);
  const height = loadedBottom + below * estimate;
  const anchor = useRef<{ key: number; id?: number; offset: number }>({ key: -1, offset: 0 });
  function rememberAnchor(scrollTop: number, rowList = rows) {
    const row = eventRowAt(rowList, scrollTop);
    anchor.current = { key: scrollTarget.key, id: row?.event?.id, offset: row ? scrollTop - row.top : 0 };
  }
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const resize = new ResizeObserver(() => setViewport((value) => ({ ...value, height: element.clientHeight })));
    resize.observe(element);
    return () => resize.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const previous = anchor.current;
    if (previous.key !== scrollTarget.key) {
      const row = scrollTarget.eventId != null ? rows.find((item) => item.event?.id === scrollTarget.eventId) : undefined;
      if (row) {
        // 目标行上方留出分组标题的位置。
        element.scrollTop = Math.max(0, row.top - 30);
        locatedSelection.current = selected === scrollTarget.eventId ? selected : locatedSelection.current;
      } else if (scrollTarget.edge === "end" || scrollTarget.eventId == null) element.scrollTop = element.scrollHeight;
      rememberAnchor(element.scrollTop);
      setViewport({ top: element.scrollTop, height: element.clientHeight });
      return;
    }
    if (previous.id != null) {
      const row = rows.find((item) => item.event?.id === previous.id);
      if (row) {
        element.scrollTop = row.top + previous.offset;
        setViewport({ top: element.scrollTop, height: element.clientHeight });
      }
    }
    rememberAnchor(element.scrollTop);
  }, [events, scrollTarget, rows, selected, height]);
  useEffect(() => {
    if (!onVisibleEvents || !total) return;
    const top = viewport.top,
      bottom = viewport.top + viewport.height;
    // 把视口上下沿换算成绝对下标：落在占位区按估算行高，落在已加载区按实际行。
    const indexAt = (y: number) => {
      if (y < loadedTop || !rows.length) return Math.floor(y / estimate);
      if (y >= loadedBottom) return offset + events.length + Math.floor((y - loadedBottom) / estimate);
      return eventRowAt(rows, y)?.index ?? offset;
    };
    const clamp = (value: number) => Math.min(total - 1, Math.max(0, value));
    onVisibleEvents(clamp(indexAt(top)), clamp(indexAt(Math.max(top, bottom - 1))));
  }, [estimate, events.length, offset, loadedTop, loadedBottom, onVisibleEvents, rows, total, viewport]);
  useEffect(() => {
    if (selected === null) {
      locatedSelection.current = null;
      return;
    }
    if (locatedSelection.current === selected) return;
    const row = rows.find((row) => row.event?.id === selected);
    const element = scroller.current;
    if (row && element) {
      locatedSelection.current = selected;
      if (row.top < element.scrollTop || row.top > element.scrollTop + element.clientHeight - 80) element.scrollTop = row.top;
    }
  }, [selected, rows]);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!following || !element) return;
    element.scrollTop = element.scrollHeight;
    // 同步虚拟列表的可见范围，避免滚动后短暂显示空白。
    setViewport((current) => current.top === element.scrollTop && current.height === element.clientHeight
      ? current : { top: element.scrollTop, height: element.clientHeight });
  }, [following, height, viewport.height]);
  return (
    <div
      className="events trace-events min-h-[100px] flex-1 overflow-auto px-2 [overflow-anchor:none]"
      ref={scroller}
      onScroll={(event) => {
        rememberAnchor(event.currentTarget.scrollTop);
        setViewport({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight });
      }}
    >
      {!events.length && total === 0 && <p className="p-6 text-center text-xs text-muted-foreground">{t("trace:empty")}</p>}
      <div style={{ height, position: "relative" }}>
        {rows
          .filter((row) => row.top + row.height >= viewport.top - 180 && row.top <= viewport.top + viewport.height + 180)
          .map((row) => (
            <div key={row.key} style={{ position: "absolute", left: 0, right: 0, top: row.top, height: row.height }}>
              {row.heading ? (
                <div className="flex h-[30px] items-center border-b px-2 text-[11px] text-muted-foreground">{row.heading}</div>
              ) : row.event ? (
                <button
                  type="button"
                  className={cn(
                    "event-row trace-event-row grid h-[38px] w-full grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 text-left text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 max-[480px]:grid-cols-[48px_minmax(0,1fr)]",
                    selected === row.event.id && "bg-primary/10 hover:bg-primary/15",
                    range && !eventOverlapsRange(row.event, range.from, range.to) && "opacity-40",
                  )}
                  data-kind={row.event.kind}
                  data-dimmed={(range && !eventOverlapsRange(row.event, range.from, range.to)) || undefined}
                  data-bookkeeping={row.event.bookkeeping || undefined}
                  aria-current={selected === row.event.id ? "true" : undefined}
                  title={row.event.preview}
                  onClick={() => {
                    if (!row.event) return;
                    if (range && !eventOverlapsRange(row.event, range.from, range.to)) {
                      onClearRange();
                      return;
                    }
                    onSelect(row.event.id);
                  }}
                >
                  <span className={cn("truncate rounded px-1 py-0.5 text-center text-[11px]", traceKindTone(row.event.kind).badge)}>
                    {t(`trace:kinds.${row.event.kind}`)}
                  </span>
                  <span className="truncate">
                    {row.event.bookkeeping && <span className="font-medium">{t("trace:bookkeeping")} · </span>}
                    {row.event.tool && <span className="font-medium">{row.event.tool} · </span>}
                    {row.event.preview || t(`trace:kinds.${row.event.kind}`)}
                  </span>
                  <span className="text-[11px] text-muted-foreground tabular-nums max-[480px]:hidden">
                    {row.event.durationMs !== undefined
                      ? formatTraceDuration(row.event.durationMs)
                      : row.event.timestamp
                        ? new Date(row.event.timestamp).toLocaleTimeString(i18n.resolvedLanguage, { hour12: false })
                        : "—"}
                  </span>
                </button>
              ) : null}
            </div>
          ))}
      </div>
    </div>
  );
}
