import { useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, PanelRight, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Input } from "@/components/ui/input";
import type { TraceQuery } from "@/shared/extensionTypes";
import { cn } from "@/lib/utils";
import { EventDetail } from "./EventDetail";
import { EventList } from "./EventList";
import { Timeline } from "./Timeline";
import { TraceError } from "./TraceError";
import { formatTraceDuration } from "./formatTraceDuration";
import { useTraceData } from "./useTraceData";
import type { TraceQueryFn } from "./useSessionTrace";

const filters = ["all", "user", "context", "tool", "error"] as const satisfies ReadonlyArray<NonNullable<TraceQuery["filter"]>>;

interface SessionTraceViewProps {
  /** 绑定当前租约的只读查询。 */
  query: TraceQueryFn;
  /** 宿主收到新增内容通知时递增，保留阅读状态并刷新当前页。 */
  revision: number;
}
/** 官方轨迹界面由宿主直接渲染，复用项目组件与主题；数据仍来自插件解析进程。 */
export function SessionTraceView({ query, revision }: SessionTraceViewProps) {
  const { t } = useTranslation(["trace"]);
  const [inspector, setInspector] = useState(false);
  const {
    page, timeline, selected, detail, error, detailError, loading, follow, search,
    filter: activeFilter, showBookkeeping, pageNumber, pageCount, hasPrevious, hasNext,
    searchInput, changeFilter, setShowBookkeeping, select, jump, changePage, setFollow, refresh,
  } = useTraceData(query, revision);
  const stats = page?.stats;
  const duration = stats?.start && stats.end ? Date.parse(stats.end) - Date.parse(stats.start) : null;
  return (
    <div className="session-trace flex min-h-0 min-w-0 flex-1 flex-col bg-background text-xs text-foreground">
      <div className="stats trace-stats flex flex-wrap items-center gap-3 px-3 py-2 text-muted-foreground tabular-nums">
        <span className="flex items-center gap-1.5">
          <Clock3 className="size-3.5" />
          {duration === null ? "—" : formatTraceDuration(duration)}
        </span>
        <span>{stats ? t("trace:counts.turns", { count: stats.rounds }) : t("trace:unknown.turns")}</span>
        <span title={stats?.requests === null ? t("trace:requestUnknown") : undefined}>
          {stats?.requests == null ? t("trace:unknown.requests") : t("trace:counts.requests", { count: stats.requests })}
        </span>
        <span>{stats ? t("trace:counts.tools", { count: stats.tools }) : t("trace:unknown.tools")}</span>
        <span>{stats?.tokens == null ? t("trace:unknown.tokens") : t("trace:counts.tokens", { value: `${(stats.tokens / 1000).toFixed(1)}k` })}</span>
        {!!stats?.errors && <span className="text-destructive">{t("trace:counts.errors", { count: stats.errors })}</span>}
      </div>
      <Timeline events={timeline.events} truncated={timeline.truncated} onSelect={jump} />
      <div className="flex flex-wrap items-center gap-2 border-y px-3 py-2">
        <div role="group" aria-label={t("trace:filter")} className="flex flex-wrap items-center gap-1">
          {filters.map((filter) => (
            <Button
              key={filter}
              aria-pressed={activeFilter === filter}
              className="h-7 rounded-full px-3 text-xs font-normal"
              variant={activeFilter === filter ? "secondary" : "outline"}
              onClick={() => changeFilter(filter)}
            >
              {filter === "all" ? t("trace:all") : t(`trace:kinds.${filter}`)}
            </Button>
          ))}
        </div>
        <div className="relative min-w-40 flex-1 basis-44">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1.5 left-2 size-3.5 text-muted-foreground" />
          <Input
            type="search"
            className="h-7 pl-8 text-xs md:text-xs"
            value={search}
            placeholder={t("trace:search")}
            aria-label={t("trace:search")}
            onChange={(event) => searchInput(event.target.value)}
          />
        </div>
        <IconTooltip
          label={t("trace:inspector")}
          aria-pressed={inspector}
          className={cn(inspector && "bg-accent text-foreground")}
          onClick={() => setInspector((value) => !value)}
        >
          <PanelRight className="size-3.5" />
        </IconTooltip>
      </div>
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center" role="alert">
          <TraceError code={error} />
          <Button variant="outline" size="sm" onClick={refresh}>{t("trace:retry")}</Button>
        </div>
      ) : !page ? (
        <div className="flex flex-1 items-center justify-center p-6 text-muted-foreground">{t("trace:loading")}</div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 max-[680px]:flex-col">
          <EventList
            events={page.events}
            selected={selected}
            detail={detail}
            detailError={detailError}
            inspector={inspector}
            following={follow}
            onSelect={select}
          />
          {inspector && (
            <aside className="detail trace-detail flex-[0_0_280px] overflow-auto border-l px-3 py-2 max-[680px]:flex-[0_0_220px] max-[680px]:border-t max-[680px]:border-l-0">
              {selected !== null ? (
                <EventDetail selected={selected} detail={detail} failed={detailError} />
              ) : (
                <p className="flex h-full items-center justify-center p-4 text-muted-foreground">{t("trace:inspectorEmpty")}</p>
              )}
            </aside>
          )}
        </div>
      )}
      <footer className="trace-footer flex flex-wrap items-center gap-3 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        <span role="status" aria-live="polite">
          {loading ? t("trace:loading") : t("trace:counts.events", { count: page?.total ?? 0 })}
        </span>
        <label className="flex items-center gap-1.5" title={t("trace:showAllHint")}>
          <Checkbox checked={showBookkeeping} onCheckedChange={(checked) => setShowBookkeeping(checked === true)} />
          {t("trace:showAll")}
        </label>
        <label className="flex items-center gap-1.5">
          <Checkbox checked={follow} onCheckedChange={(checked) => setFollow(checked === true)} />
          {t("trace:following")}
        </label>
        <span className="flex-1" />
        <IconTooltip label={t("trace:previous")} size="icon-xs" data-trace-page="previous" disabled={!hasPrevious || loading} onClick={() => changePage(-1)}>
          <ChevronLeft className="size-3.5" />
        </IconTooltip>
        <span className="tabular-nums">{pageNumber} / {pageCount}</span>
        <IconTooltip label={t("trace:next")} size="icon-xs" data-trace-page="next" disabled={!hasNext || loading} onClick={() => changePage(1)}>
          <ChevronRight className="size-3.5" />
        </IconTooltip>
      </footer>
    </div>
  );
}
