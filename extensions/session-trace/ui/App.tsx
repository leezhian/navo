import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Clock3, ChevronLeft, ChevronRight, PanelRight } from "lucide-react";
import type { TraceDetail, TraceEvent, TracePage, TraceQuery } from "../../../src/shared/extensionTypes";
import { bridge } from "./bridge";
import { useTranslation } from "react-i18next";
import { normalizeLocale } from "../../../src/shared/locales";
import { EventList } from "./EventList";
import { Timeline } from "./Timeline";
import { EventDetail } from "./EventDetail";

const PAGE_SIZE = 80;
export function App() {
  const { t, i18n } = useTranslation(["trace"]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
          const locale = normalizeLocale(value.locale);
          void i18n.changeLanguage(locale);
          document.documentElement.lang = locale;
          document.documentElement.style.colorScheme = value.dark ? "dark" : "light";
          for (const [name, value_] of Object.entries(value.tokens))
            if (/^[a-z-]+$/.test(name)) document.documentElement.style.setProperty("--" + name, value_);
        },
        () => setRevision((value) => value + 1),
      ),
    [i18n],
  );
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  function searchInput(value: string) {
    setSearch(value);
    setSelected(null);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setQuery((current) => ({ ...current, search: value, offset: 0 })), 180);
  }
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
    // 时间线定位取消尚未提交的搜索，避免防抖回调再把分页重置为首页。
    clearTimeout(searchTimer.current);
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
        <span>{stats ? t("trace:counts.turns", { count: stats.rounds }) : t("trace:unknown.turns")}</span>
        <span title={stats?.requests === null ? t("trace:requestUnknown") : undefined}>
          {stats?.requests == null ? t("trace:unknown.requests") : t("trace:counts.requests", { count: stats.requests })}
        </span>
        <span>{stats ? t("trace:counts.tools", { count: stats.tools }) : t("trace:unknown.tools")}</span>
        <span>{stats?.tokens == null ? "—" : (stats.tokens / 1000).toFixed(1) + "k"} tokens</span>
        {!!stats?.errors && <span className="error-count">{t("trace:counts.errors", { count: stats.errors })}</span>}
      </div>
      <Timeline events={timeline.events} truncated={timeline.truncated} onSelect={jump} />
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
              {filter === "all" ? t("trace:all") : t(`trace:kinds.${filter}`)}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={14} />
          <input
            type="search"
            value={search}
            placeholder={t("trace:search")}
            aria-label={t("trace:search")}
            onChange={(event) => searchInput(event.target.value)}
          />
        </label>
        <button
          aria-label={t("trace:inspector")}
          title={t("trace:inspector")}
          aria-pressed={inspector}
          onClick={() => setInspector((value) => !value)}
        >
          <PanelRight size={15} />
        </button>
      </div>
      {error ? (
        <div className="empty" role="alert">
          {t("trace:error")}
          <button onClick={() => setRevision((value) => value + 1)}>{t("trace:retry")}</button>
        </div>
      ) : !page ? (
        <div className="empty">{t("trace:loading")}</div>
      ) : (
        <div className="trace-body">
          <EventList
            events={page.events}
            selected={selected}
            detail={detail}
            detailError={detailError}
            inspector={inspector}
            onSelect={select}
          />
          {inspector && selected !== null && (
            <aside className="inspector detail">
              <EventDetail selected={selected} detail={detail} failed={detailError} />
            </aside>
          )}
        </div>
      )}
      <footer>
        <span role="status" aria-live="polite">
          {loading ? t("trace:loading") : t("trace:counts.events", { count: page?.total ?? 0 })}
        </span>
        <label>
          <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />
          {t("trace:following")}
        </label>
        <span className="spacer" />
        <button
          aria-label={t("trace:previous")}
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
          aria-label={t("trace:next")}
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
