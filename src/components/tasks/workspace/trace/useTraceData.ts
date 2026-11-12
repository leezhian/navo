import { useCallback, useEffect, useRef, useState } from "react";
import type { TraceDetail, TraceEvent, TracePage, TraceQuery } from "@/shared/extensionTypes";
import { traceErrorCode } from "./TraceError";
import type { TraceErrorCode } from "./TraceError";
import type { TraceQueryFn } from "./useSessionTrace";

const PAGE_SIZE = 80;
const SEARCH_DELAY = 180;

/** 只发送有值的字段，避免空字段经 contextBridge 变成 null。 */
function compact(query: TraceQuery): TraceQuery {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== null)) as TraceQuery;
}

/** 统一处理查询、实时刷新与详情竞态，页面仅组装状态和操作入口。hostRevision 来自宿主的变化通知。 */
export function useTraceData(runQuery: TraceQueryFn, hostRevision: number) {
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [query, setQuery] = useState<TraceQuery>({ kind: "page", limit: PAGE_SIZE, offset: 0, filter: "all", search: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState<TracePage | null>(null);
  const [timeline, setTimeline] = useState<{ events: TraceEvent[]; truncated: boolean }>({ events: [], truncated: false });
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [error, setError] = useState<TraceErrorCode | null>(null);
  const [detailError, setDetailError] = useState<TraceErrorCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [localRevision, setLocalRevision] = useState(0);
  const [follow, setFollow] = useState(false);
  const request = useRef(0), detailRequest = useRef(0);
  const refresh = useCallback(() => setLocalRevision((value) => value + 1), []);
  const revision = hostRevision + localRevision;

  useEffect(() => () => clearTimeout(searchTimer.current), []);
  useEffect(() => {
    const sequence = ++request.current;
    setLoading(true);
    setError(null);
    const showBookkeeping = Boolean(query.showBookkeeping);
    void Promise.all([
      runQuery(compact({ ...query, showBookkeeping })),
      runQuery({ kind: "timeline", showBookkeeping }),
    ]).then(([result, marks]) => {
      if (sequence !== request.current) return;
      const next = result as TracePage;
      setPage(next);
      setTimeline(marks as typeof timeline);
      setLoading(false);
      const lastOffset = Math.max(0, Math.floor((next.total - 1) / PAGE_SIZE) * PAGE_SIZE);
      if (query.eventId !== undefined) {
        const offset = next.offset ?? 0;
        setQuery((current) => (current.eventId === query.eventId ? { ...current, offset, eventId: undefined } : current));
      } else if (follow && next.total && query.offset !== lastOffset)
        setQuery((current) => ({ ...current, offset: lastOffset }));
      else if ((query.offset ?? 0) > lastOffset)
        setQuery((current) => ({ ...current, offset: lastOffset }));
    }).catch((caught) => {
      if (sequence === request.current) {
        setError(traceErrorCode(caught));
        setLoading(false);
      }
    });
    return () => { request.current++; };
  }, [query, revision, follow, runQuery]);

  useEffect(() => {
    const sequence = ++detailRequest.current;
    setDetail(null);
    setDetailError(null);
    if (selected !== null) void runQuery({ kind: "detail", eventId: selected }).then((value) => {
      if (sequence === detailRequest.current) setDetail(value as TraceDetail);
    }).catch((caught) => {
      if (sequence === detailRequest.current) setDetailError(traceErrorCode(caught));
    });
    return () => { detailRequest.current++; };
  }, [selected, revision, runQuery]);

  function searchInput(value: string) {
    setSearch(value);
    setSelected(null);
    // 搜索是主动浏览操作，不能被跟随模式再次带到最后一页。
    setFollow(false);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setQuery((current) => ({ ...current, search: value, offset: 0, eventId: undefined })), SEARCH_DELAY);
  }
  function changeFilter(filter: TraceQuery["filter"]) {
    setQuery((current) => ({ ...current, filter, offset: 0, eventId: undefined }));
    setSelected(null);
    setFollow(false);
  }
  function setShowBookkeeping(showBookkeeping: boolean) {
    setQuery((current) => ({ ...current, showBookkeeping: showBookkeeping || undefined, offset: 0, eventId: undefined }));
    setSelected(null);
    setFollow(false);
  }
  const select = useCallback((id: number) => {
    setSelected((current) => current === id ? null : id);
    setFollow(false);
  }, []);
  function jump(id: number) {
    // 时间线定位优先于尚未提交的搜索，避免防抖回调覆盖目标页。
    clearTimeout(searchTimer.current);
    setSearch("");
    setFollow(false);
    setQuery((current) => ({
      kind: "page",
      eventId: id,
      limit: PAGE_SIZE,
      filter: "all",
      search: "",
      showBookkeeping: current.showBookkeeping,
    }));
    setSelected(id);
  }
  function changePage(direction: -1 | 1) {
    setFollow(false);
    setSelected(null);
    setQuery((current) => ({ ...current, eventId: undefined, offset: Math.max(0, (current.offset ?? 0) + direction * PAGE_SIZE) }));
  }
  return {
    page, timeline, selected, detail, error, detailError, loading, follow, search,
    filter: query.filter,
    showBookkeeping: Boolean(query.showBookkeeping),
    pageNumber: Math.floor((query.offset ?? 0) / PAGE_SIZE) + 1,
    pageCount: Math.max(1, Math.ceil((page?.total ?? 0) / PAGE_SIZE)),
    hasPrevious: Boolean(query.offset),
    hasNext: (query.offset ?? 0) + PAGE_SIZE < (page?.total ?? 0),
    searchInput, changeFilter, setShowBookkeeping, select, jump, changePage, setFollow, refresh,
  };
}
