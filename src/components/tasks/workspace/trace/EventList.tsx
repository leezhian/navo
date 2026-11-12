import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TraceDetail, TraceEvent } from "@/shared/extensionTypes";
import { cn } from "@/lib/utils";
import { EventDetail } from "./EventDetail";
import type { TraceErrorCode } from "./TraceError";
import { formatTraceDuration } from "./formatTraceDuration";
import { traceKindTone } from "./traceKind";

interface EventListProps {
  /** 当前分页的事件摘要，正文在选择后单独读取。 */
  events: TraceEvent[];
  /** 当前选中事件；null 表示收起详情。 */
  selected: number | null;
  /** 异步读取的正文，由详情组件核对其事件 ID。 */
  detail: TraceDetail | null;
  /** 当前详情读取失败时显示原因。 */
  detailError: TraceErrorCode | null;
  /** 侧栏模式只选中行，详情由并列面板承载。 */
  inspector: boolean;
  /** 主动跟随时，在页面加载、追加和视口变化后保持最后一条事件可见。 */
  following: boolean;
  /** 展开或收起事件，不执行轨迹中的命令。 */
  onSelect: (id: number) => void;
}
export function EventList({ events, selected, detail, detailError, inspector, following, onSelect }: EventListProps) {
  const { t, i18n } = useTranslation(["trace"]);
  const scroller = useRef<HTMLDivElement>(null);
  const locatedSelection = useRef<number | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 500 });
  const rows = useMemo(() => {
    let top = 0,
      round = -1,
      request: string | undefined;
    return events.flatMap((event) => {
      const result: Array<{ key: string; top: number; height: number; heading?: string; event?: TraceEvent; detail?: boolean }> = [];
      if (event.round !== round || (event.request && event.request !== request)) {
        const heading = event.request
          ? t("trace:requestGroup", { round: event.round, request: event.request.slice(-8) })
          : t("trace:group", { round: event.round });
        result.push({ key: `heading-${event.id}`, heading, top, height: 30 });
        top += 30;
        round = event.round;
        request = event.request;
      }
      result.push({ key: `event-${event.id}`, event, top, height: 38 });
      top += 38;
      if (selected === event.id && !inspector) {
        result.push({ key: `detail-${event.id}`, detail: true, top, height: 300 });
        top += 300;
      }
      return result;
    });
  }, [events, selected, inspector, t]);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const resize = new ResizeObserver(() => setViewport((value) => ({ ...value, height: element.clientHeight })));
    resize.observe(element);
    return () => resize.disconnect();
  }, []);
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
  const height = rows.length ? rows[rows.length - 1].top + rows[rows.length - 1].height : 0;
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
      onScroll={(event) => setViewport({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight })}
    >
      {!events.length && <p className="p-6 text-center text-xs text-muted-foreground">{t("trace:empty")}</p>}
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
                  className="event-row trace-event-row grid h-[38px] w-full grid-cols-[12px_52px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 text-left text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-muted max-[480px]:grid-cols-[12px_48px_minmax(0,1fr)]"
                  data-kind={row.event.kind}
                  data-bookkeeping={row.event.bookkeeping || undefined}
                  aria-expanded={selected === row.event.id}
                  title={row.event.preview}
                  onClick={() => row.event && onSelect(row.event.id)}
                >
                  {selected === row.event.id ? <ChevronDown className="size-3 text-muted-foreground" /> : <ChevronRight className="size-3 text-muted-foreground" />}
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
              ) : (
                <div className="detail trace-detail mr-2 mb-2 ml-6 h-[292px] overflow-auto border-l-2 bg-muted px-3 py-2 max-[480px]:ml-3">
                  <EventDetail selected={selected} detail={detail} failed={detailError} />
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
