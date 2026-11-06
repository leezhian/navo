import { useCallback, useEffect, useRef, useState } from "react";
import type { TraceDetail, TraceEvent, TracePage, TraceQuery } from "../../../../src/shared/extensionTypes";
import { bridge } from "../bridge";
import { useTraceHost } from "./useTraceHost";

const PAGE_SIZE = 80;
const SEARCH_DELAY = 180;

/** 统一处理查询、实时刷新与详情竞态，页面仅组装状态和操作入口。 */
export function useTraceData() {
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [query, setQuery] = useState<TraceQuery>({ kind: "page", limit: PAGE_SIZE, offset: 0, filter: "all", search: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState<TracePage | null>(null);
  const [timeline, setTimeline] = useState<{ events: TraceEvent[]; truncated: boolean }>({ events: [], truncated: false });
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [error, setError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [follow, setFollow] = useState(false);
  const request = useRef(0), detailRequest = useRef(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useTraceHost(refresh);

  useEffect(() => () => clearTimeout(searchTimer.current), []);
  useEffect(() => {
    const sequence = ++request.current;
    setLoading(true);
    setError(false);
    void Promise.all([bridge.query(query), bridge.query({ kind: "timeline" })]).then(([result, marks]) => {
      if (sequence !== request.current) return;
      const next = result as TracePage;
      setPage(next);
      setTimeline(marks as typeof timeline);
      setLoading(false);
      const lastOffset = Math.max(0, Math.floor((next.total - 1) / PAGE_SIZE) * PAGE_SIZE);
      if (follow && next.total && query.offset !== lastOffset)
        setQuery((current) => ({ ...current, offset: lastOffset }));
      else if ((query.offset ?? 0) > lastOffset)
        setQuery((current) => ({ ...current, offset: lastOffset }));
    }).catch(() => {
      if (sequence === request.current) {
        setError(true);
        setLoading(false);
      }
    });
    return () => { request.current++; };
  }, [query, revision, follow]);

  useEffect(() => {
    const sequence = ++detailRequest.current;
    setDetail(null);
    setDetailError(false);
    if (selected !== null) void bridge.query({ kind: "detail", eventId: selected }).then((value) => {
      if (sequence === detailRequest.current) setDetail(value as TraceDetail);
    }).catch(() => {
      if (sequence === detailRequest.current) setDetailError(true);
    });
    return () => { detailRequest.current++; };
  }, [selected, revision]);

  function searchInput(value: string) {
    setSearch(value);
    setSelected(null);
    // 搜索是主动浏览操作，不能被跟随模式再次带到最后一页。
    setFollow(false);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setQuery((current) => ({ ...current, search: value, offset: 0 })), SEARCH_DELAY);
  }
  function changeFilter(filter: TraceQuery["filter"]) {
    setQuery((current) => ({ ...current, filter, offset: 0 }));
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
    setQuery({ kind: "page", offset: Math.floor((id - 1) / PAGE_SIZE) * PAGE_SIZE, limit: PAGE_SIZE, filter: "all", search: "" });
    setSelected(id);
  }
  function changePage(direction: -1 | 1) {
    setFollow(false);
    setSelected(null);
    setQuery((current) => ({ ...current, offset: Math.max(0, (current.offset ?? 0) + direction * PAGE_SIZE) }));
  }
  return {
    page, timeline, selected, detail, error, detailError, loading, follow, search,
    filter: query.filter,
    pageNumber: Math.floor((query.offset ?? 0) / PAGE_SIZE) + 1,
    pageCount: Math.max(1, Math.ceil((page?.total ?? 0) / PAGE_SIZE)),
    hasPrevious: Boolean(query.offset),
    hasNext: (query.offset ?? 0) + PAGE_SIZE < (page?.total ?? 0),
    searchInput, changeFilter, select, jump, changePage, setFollow, refresh,
  };
}
