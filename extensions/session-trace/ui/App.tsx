import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Clock3, ChevronLeft, ChevronRight, PanelRight } from "lucide-react";
import type { TraceDetail, TraceEvent, TracePage, TraceQuery } from "../../../src/shared/extensionTypes";
import { bridge } from "./bridge";
import { labels } from "./labels";
import { EventList } from "./EventList";
import { Timeline } from "./Timeline";
import { EventDetail } from "./EventDetail";

const PAGE_SIZE = 80;
export function App() {
  const [locale, setLocale] = useState("zh-CN"),
    l = locale.startsWith("zh") ? labels["zh-CN"] : labels.en;
  const [query, setQuery] = useState<TraceQuery>({ kind: "page", limit: PAGE_SIZE, offset: 0, filter: "all", search: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState<TracePage | null>(null),
    [timeline, setTimeline] = useState<{ events: TraceEvent[]; truncated: boolean }>({ events: [], truncated: false });
  const [selected, setSelected] = useState<number | null>(null),
    [detail, setDetail] = useState<TraceDetail | null>(null);
  const [error, setError] = useState(false),
    [detailError, setDetailError] = useState(false),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [follow, setFollow] = useState(false);
  const request = useRef(0),
    detailRequest = useRef(0);
  const [inspector, setInspector] = useState(false);
  useEffect(
    () =>
      bridge.subscribe(
        (value) => {
          setLocale(value.locale || "zh-CN");
          document.documentElement.lang = value.locale;
          document.documentElement.style.colorScheme = value.dark ? "dark" : "light";
          for (const [name, value_] of Object.entries(value.tokens))
            if (/^[a-z-]+$/.test(name)) document.documentElement.style.setProperty("--" + name, value_);
        },
        () => setRevision((value) => value + 1),
      ),
    [],
  );
  useEffect(() => {
    const timer = setTimeout(() => setQuery((current) => ({ ...current, search, offset: 0 })), 180);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const sequence = ++request.current;
    setLoading(true);
    setError(false);
    void Promise.all([bridge.query(query), bridge.query({ kind: "timeline" })])
      .then(([result, marks]) => {
        if (sequence !== request.current) return;
        const next = result as TracePage;
        setPage(next);
        setTimeline(marks as typeof timeline);
        setLoading(false);
        const lastOffset = Math.max(0, Math.floor((next.total - 1) / PAGE_SIZE) * PAGE_SIZE);
        if (follow && next.total && query.offset !== lastOffset) setQuery((current) => ({ ...current, offset: lastOffset }));
        else if ((query.offset ?? 0) > lastOffset) setQuery((current) => ({ ...current, offset: lastOffset }));
      })
      .catch(() => {
        if (sequence === request.current) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      request.current++;
    };
  }, [query, revision, follow]);
  useEffect(() => {
    const sequence = ++detailRequest.current;
    setDetail(null);
    setDetailError(false);
    if (selected !== null)
      void bridge
        .query({ kind: "detail", eventId: selected })
        .then((value) => {
          if (sequence === detailRequest.current) setDetail(value as TraceDetail);
        })
        .catch(() => {
          if (sequence === detailRequest.current) setDetailError(true);
        });
    return () => {
      detailRequest.current++;
    };
  }, [selected, revision]);
  const select = useCallback((id: number) => {
    setSelected((current) => (current === id ? null : id));
    setFollow(false);
  }, []);
  function jump(id: number) {
    setSearch("");
    setFollow(false);
    setQuery({ kind: "page", offset: Math.floor((id - 1) / PAGE_SIZE) * PAGE_SIZE, limit: PAGE_SIZE, filter: "all", search: "" });
    setSelected(id);
  }
  const stats = page?.stats;
  const duration = stats?.start && stats.end ? (Date.parse(stats.end) - Date.parse(stats.start)) / 1000 : null;
  return (
    <main>
      <div className="stats">
        <span>
          <Clock3 size={14} />
          {duration === null ? "—" : `${duration.toFixed(1)}s`}
        </span>
        <span>
          {stats?.rounds ?? "—"} {l.rounds}
        </span>
        <span title={stats?.requests === null ? l.requestUnknown : undefined}>
          {stats?.requests ?? "—"} {l.requests}
        </span>
        <span>
          {stats?.tools ?? "—"} {l.tools}
        </span>
        <span>{stats?.tokens == null ? "—" : (stats.tokens / 1000).toFixed(1) + "k"} tokens</span>
        {!!stats?.errors && (
          <span className="error-count">
            {stats.errors} {l.errors}
          </span>
        )}
      </div>
      <Timeline events={timeline.events} truncated={timeline.truncated} labels={l} onSelect={jump} />
      <div className="toolbar">
        <div className="filters">
          {(["all", "user", "context", "tool", "error"] as const).map((filter) => (
            <button
              key={filter}
              aria-pressed={query.filter === filter}
              onClick={() => {
                setQuery((current) => ({ ...current, filter, offset: 0 }));
                setSelected(null);
                setFollow(false);
              }}
            >
              {filter === "all" ? l.all : l.kinds[filter]}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={14} />
          <input
            type="search"
            value={search}
            placeholder={l.search}
            aria-label={l.search}
            onChange={(event) => {
              setSearch(event.target.value);
              setSelected(null);
            }}
          />
        </label>
        <button aria-label={l.inspector} title={l.inspector} aria-pressed={inspector} onClick={() => setInspector((value) => !value)}>
          <PanelRight size={15} />
        </button>
      </div>
      {error ? (
        <div className="empty" role="alert">
          {l.error}
          <button onClick={() => setRevision((value) => value + 1)}>{l.retry}</button>
        </div>
      ) : !page ? (
        <div className="empty">{l.loading}</div>
      ) : (
        <div className="trace-body">
          <EventList
            events={page.events}
            selected={selected}
            detail={detail}
            detailError={detailError}
            inspector={inspector}
            labels={l}
            onSelect={select}
          />
          {inspector && selected !== null && (
            <aside className="inspector detail">
              <EventDetail selected={selected} detail={detail} failed={detailError} labels={l} />
            </aside>
          )}
        </div>
      )}
      <footer>
        <span role="status" aria-live="polite">
          {loading ? l.loading : `${page?.total ?? 0} ${l.events}`}
        </span>
        <label>
          <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />
          {l.following}
        </label>
        <span className="spacer" />
        <button
          aria-label={l.previous}
          disabled={!query.offset || loading}
          onClick={() => {
            setFollow(false);
            setSelected(null);
            setQuery((current) => ({ ...current, offset: Math.max(0, (current.offset ?? 0) - PAGE_SIZE) }));
          }}
        >
          <ChevronLeft size={14} />
        </button>
        <span>
          {Math.floor((query.offset ?? 0) / PAGE_SIZE) + 1} / {Math.max(1, Math.ceil((page?.total ?? 0) / PAGE_SIZE))}
        </span>
        <button
          aria-label={l.next}
          disabled={(query.offset ?? 0) + PAGE_SIZE >= (page?.total ?? 0) || loading}
          onClick={() => {
            setSelected(null);
            setQuery((current) => ({ ...current, offset: (current.offset ?? 0) + PAGE_SIZE }));
          }}
        >
          <ChevronRight size={14} />
        </button>
      </footer>
    </main>
  );
}
