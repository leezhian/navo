import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { TraceQuery } from "@/shared/extensionTypes";
import { cn } from "@/lib/utils";
import { WorkspaceSeparator } from "../WorkspaceSeparator";
import { EventDetail } from "./EventDetail";
import { EventList } from "./EventList";
import { Timeline } from "./Timeline";
import { TraceError } from "./TraceError";
import { useTraceData } from "./useTraceData";
import type { TraceQueryFn } from "./useSessionTrace";

const filters = ["all", "user", "context", "tool", "error"] as const satisfies ReadonlyArray<NonNullable<TraceQuery["filter"]>>;
const LIST_MIN = 240;
const DETAIL_MIN = 220;
const DEFAULT_DETAIL = 280;
const STACKED_QUERY = "(max-width: 680px)";

function clampDetailWidth(width: number, containerWidth: number) {
  const max = Math.max(DETAIL_MIN, containerWidth - LIST_MIN);
  return Math.max(DETAIL_MIN, Math.min(width, max));
}

interface SessionTraceViewProps {
  /** 绑定当前租约的只读查询。 */
  query: TraceQueryFn;
  /** 宿主收到新增内容通知时递增，保留阅读状态并刷新当前窗口。 */
  revision: number;
  /** 按任务和原生会话隔离的窗口内阅读记录；独立预览可省略。 */
  readingKey?: string;
}
/** 官方轨迹界面由宿主直接渲染，复用项目组件与主题；数据仍来自插件解析进程。 */
export function SessionTraceView({ query, revision, readingKey }: SessionTraceViewProps) {
  const { t } = useTranslation(["trace"]);
  const splitRef = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(() => typeof window !== "undefined" && window.matchMedia(STACKED_QUERY).matches);
  const [detailWidth, setDetailWidth] = useState(DEFAULT_DETAIL);
  // 不记住。视图挂在会话上，终端和轨迹来回切换还在；换会话会卸掉。
  const [actualDuration, setActualDuration] = useState(false);
  const {
    events,
    offset,
    total,
    stats,
    timeline,
    selected,
    detail,
    error,
    detailError,
    loading,
    follow,
    search,
    range,
    scrollTarget,
    filter: activeFilter,
    showBookkeeping,
    searchInput,
    changeFilter,
    setShowBookkeeping,
    select,
    jump,
    setRange,
    clearRange,
    setFollow,
    refresh,
    onVisibleEvents,
    rememberPosition,
  } = useTraceData(query, revision, readingKey);
  const open = selected !== null;
  useEffect(() => {
    const media = window.matchMedia(STACKED_QUERY);
    const update = () => setStacked(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const element = splitRef.current;
    if (!element || !open || stacked) return;
    const update = () => {
      // 切到终端时父级会把轨迹视图设成 display:none，宽度为 0，不能把详情栏夹成最小值。
      const containerWidth = element.clientWidth;
      if (containerWidth <= 0) return;
      setDetailWidth((width) => clampDetailWidth(width, containerWidth));
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [open, stacked]);
  // 整段会话没有任何带时间的事件时隐藏时间线并提示；部分有时间时时间线只画这些事件。
  const untimed = Boolean(stats) && !loading && timeline.events.length === 0;
  return (
    <div
      className="session-trace flex min-h-0 min-w-0 flex-1 flex-col bg-background text-xs text-foreground"
      onKeyDown={(event) => {
        if (event.key === "Escape" && range) {
          event.preventDefault();
          clearRange();
        }
      }}
    >
      <div className="stats trace-stats flex flex-wrap items-center gap-3 px-3 py-2 text-muted-foreground tabular-nums">
        <span>{stats ? t("trace:counts.turns", { count: stats.rounds }) : t("trace:unknown.turns")}</span>
        <span title={stats?.requests === null ? t("trace:requestUnknown") : undefined}>
          {stats?.requests == null ? t("trace:unknown.requests") : t("trace:counts.requests", { count: stats.requests })}
        </span>
        <span>{stats ? t("trace:counts.tools", { count: stats.tools }) : t("trace:unknown.tools")}</span>
        {!!stats?.errors && <span className="text-destructive">{t("trace:counts.errors", { count: stats.errors })}</span>}
        {!untimed && (
          <Button
            type="button"
            size="xs"
            variant={actualDuration ? "secondary" : "outline"}
            aria-pressed={actualDuration}
            className="ml-auto rounded-full font-normal"
            title={actualDuration ? t("trace:axis.useEqualWidth") : t("trace:axis.useActualDuration")}
            onClick={() => {
              setActualDuration((value) => !value);
              clearRange();
            }}
          >
            {t("trace:axis.duration")}
          </Button>
        )}
      </div>
      {untimed ? (
        <p className="px-3 pb-3 text-xs text-muted-foreground">{t("trace:timelineMissing")}</p>
      ) : (
        <Timeline
          events={timeline.events}
          truncated={timeline.truncated}
          selectedId={selected}
          range={range}
          onSelect={jump}
          onRangeSelect={setRange}
          onRangeClear={clearRange}
          actualDuration={actualDuration}
        />
      )}
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
            className={cn(
              "h-7 pl-8 text-xs md:text-xs [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
              search && "pr-7",
            )}
            value={search}
            placeholder={t("trace:search")}
            aria-label={t("trace:search")}
            onChange={(event) => searchInput(event.target.value)}
          />
          {search && (
            <IconTooltip label={t("trace:clearSearch")} size="icon-xs" className="absolute top-0.5 right-0.5" onClick={() => searchInput("")}>
              <X aria-hidden="true" className="size-3.5" />
            </IconTooltip>
          )}
        </div>
      </div>
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center" role="alert">
          <TraceError code={error} />
          <Button variant="outline" size="sm" onClick={refresh}>{t("trace:retry")}</Button>
        </div>
      ) : !stats && loading ? (
        <div className="flex flex-1 items-center justify-center p-6 text-muted-foreground">{t("trace:loading")}</div>
      ) : (
        <div ref={splitRef} className="flex min-h-0 min-w-0 flex-1 max-[680px]:flex-col">
          <EventList
            events={events}
            offset={offset}
            selected={selected}
            following={follow}
            onSelect={select}
            total={total}
            range={range}
            scrollTarget={scrollTarget}
            onVisibleEvents={onVisibleEvents}
            onClearRange={clearRange}
            onRememberPosition={rememberPosition}
          />
          {open && !stacked && (
            <div className="relative z-10 flex w-2 shrink-0 -mx-1 self-stretch">
              {/* 8px 热区用负边距叠在分割线上；零宽容器的溢出子节点点不到，会点到事件列表。 */}
              <WorkspaceSeparator
                label={t("trace:resizeDetail")}
                value={detailWidth}
                min={DETAIL_MIN}
                max={Math.max(DETAIL_MIN, (splitRef.current?.clientWidth ?? 0) - LIST_MIN)}
                onDelta={(delta) => setDetailWidth((width) => clampDetailWidth(width - delta, splitRef.current?.clientWidth ?? 0))}
              />
            </div>
          )}
          {open && (
            <aside
              className={cn("detail trace-detail min-h-0 min-w-0 overflow-auto px-3 py-2", stacked ? "h-[220px] shrink-0 border-t" : "border-l")}
              style={stacked ? undefined : { flex: `0 0 ${detailWidth}px`, width: detailWidth }}
            >
              <EventDetail selected={selected} detail={detail} failed={detailError} />
            </aside>
          )}
        </div>
      )}
      <footer className="trace-footer flex flex-wrap items-center gap-3 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        <span role="status" aria-live="polite">
          {loading ? t("trace:loading") : t("trace:counts.events", { count: total })}
        </span>
        <label className="flex items-center gap-1.5" title={t("trace:showAllHint")}>
          <Checkbox checked={showBookkeeping} onCheckedChange={(checked) => setShowBookkeeping(checked === true)} />
          {t("trace:showAll")}
        </label>
        <label className="flex items-center gap-1.5">
          <Checkbox checked={follow} onCheckedChange={(checked) => setFollow(checked === true)} />
          {t("trace:following")}
        </label>
      </footer>
    </div>
  );
}
