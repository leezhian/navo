import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { TraceDetail, TraceEvent } from "../../../src/shared/extensionTypes";
import type { Labels } from "./labels";
import { EventDetail } from "./EventDetail";

interface EventListProps {
  /** 当前分页的事件摘要，正文在选择后单独读取。 */
  events: TraceEvent[];
  selected: number | null;
  detail: TraceDetail | null;
  detailError: boolean;
  /** 侧栏模式只选中行，详情由并列面板承载。 */
  inspector: boolean;
  labels: Labels;
  /** 展开或收起事件，不执行轨迹中的命令。 */
  onSelect: (id: number) => void;
}
export function EventList({ events, selected, detail, detailError, inspector, labels: l, onSelect }: EventListProps) {
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
        const heading = `${l.round} ${event.round}${event.request ? ` · ${l.request} ${event.request.slice(-8)}` : ""}`;
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
  }, [events, selected, inspector, l]);
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
  return (
    <div
      className="events"
      ref={scroller}
      onScroll={(event) => setViewport({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight })}
    >
      {!events.length && <p className="empty">{l.empty}</p>}
      <div style={{ height, position: "relative" }}>
        {rows
          .filter((row) => row.top + row.height >= viewport.top - 180 && row.top <= viewport.top + viewport.height + 180)
          .map((row) => (
            <div key={row.key} style={{ position: "absolute", left: 0, right: 0, top: row.top, height: row.height }}>
              {row.heading ? (
                <div className="group-heading">{row.heading}</div>
              ) : row.event ? (
                <button
                  className="event-row"
                  data-kind={row.event.kind}
                  aria-expanded={selected === row.event.id}
                  title={row.event.preview}
                  onClick={() => row.event && onSelect(row.event.id)}
                >
                  {selected === row.event.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span className="kind">{l.kinds[row.event.kind]}</span>
                  <span className="event-preview">
                    {row.event.tool && <b>{row.event.tool} · </b>}
                    {row.event.preview || l.kinds[row.event.kind]}
                  </span>
                  <span className="time">
                    {row.event.durationMs !== undefined
                      ? `${(row.event.durationMs / 1000).toFixed(1)}s`
                      : row.event.timestamp
                        ? new Date(row.event.timestamp).toLocaleTimeString([], { hour12: false })
                        : "—"}
                  </span>
                </button>
              ) : (
                <div className="detail">
                  <EventDetail selected={selected} detail={detail} failed={detailError} labels={l} />
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
