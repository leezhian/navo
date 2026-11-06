import { useState } from "react";
import { Search, Clock3, ChevronLeft, ChevronRight, PanelRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTraceData } from "./hooks/useTraceData";
import { EventList } from "./EventList";
import { Timeline } from "./Timeline";
import { EventDetail } from "./EventDetail";

export function App() {
  const { t } = useTranslation(["trace"]);
  const [inspector, setInspector] = useState(false);
  const {
    page, timeline, selected, detail, error, detailError, loading, follow, search,
    filter: activeFilter, pageNumber, pageCount, hasPrevious, hasNext,
    searchInput, changeFilter, select, jump, changePage, setFollow, refresh,
  } = useTraceData();
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
              aria-pressed={activeFilter === filter}
              onClick={() => changeFilter(filter)}
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
          <button onClick={refresh}>{t("trace:retry")}</button>
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
            following={follow}
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
          disabled={!hasPrevious || loading}
          onClick={() => changePage(-1)}
        >
          <ChevronLeft size={14} />
        </button>
        <span>
          {pageNumber} / {pageCount}
        </span>
        <button
          aria-label={t("trace:next")}
          disabled={!hasNext || loading}
          onClick={() => changePage(1)}
        >
          <ChevronRight size={14} />
        </button>
      </footer>
    </main>
  );
}
