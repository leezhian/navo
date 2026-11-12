import { useCallback, useEffect, useRef, useState } from "react";
import type { TraceDetail, TraceEvent, TracePage, TraceQuery } from "@/shared/extensionTypes";
import { traceErrorCode } from "./TraceError";
import type { TraceErrorCode } from "./TraceError";
import type { TraceQueryFn } from "./useSessionTrace";
import { mergeTraceWindows, tailWindowOffsets, visibleWindowOffsets, type TraceWindow } from "./traceRange";

export const TRACE_WINDOW_SIZE = 80;
const SEARCH_DELAY = 180;
const PREFETCH_THRESHOLD = 16;

/** 只发送有值的字段，避免空字段经 contextBridge 变成 null。 */
function compact(query: TraceQuery): TraceQuery {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== null)) as TraceQuery;
}

interface TraceCriteria {
  filter: TraceQuery["filter"];
  search: string;
  showBookkeeping?: boolean;
}

/** 框选时间段，ISO-8601；只用于高亮和定位，不参与列表过滤。 */
export interface TraceRange {
  from: string;
  to: string;
}

/** 列表滚动请求：key 变化时执行一次，定位到事件或停在最新一条。 */
export interface TraceScrollTarget {
  key: number;
  eventId?: number;
  edge?: "end";
}

function pageQuery(criteria: TraceCriteria, extra: Partial<TraceQuery> = {}): TraceQuery {
  return compact({
    kind: "page",
    limit: TRACE_WINDOW_SIZE,
    filter: criteria.filter,
    search: criteria.search,
    showBookkeeping: criteria.showBookkeeping,
    ...extra,
  });
}

function toWindow(page: TracePage, offset: number): TraceWindow {
  return { offset, events: page.events, total: page.total, stats: page.stats };
}

/** 统一处理查询、窗口预取、实时刷新与详情竞态。hostRevision 来自宿主的变化通知。 */
export function useTraceData(runQuery: TraceQueryFn, hostRevision: number) {
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [criteria, setCriteria] = useState<TraceCriteria>({ filter: "all", search: "" });
  const [range, setRangeState] = useState<TraceRange | null>(null);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState<TraceWindow | null>(null);
  const [timeline, setTimeline] = useState<{ events: TraceEvent[]; truncated: boolean }>({ events: [], truncated: false });
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [error, setError] = useState<TraceErrorCode | null>(null);
  const [detailError, setDetailError] = useState<TraceErrorCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [localRevision, setLocalRevision] = useState(0);
  const [follow, setFollow] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<TraceScrollTarget>({ key: 0 });
  const request = useRef(0),
    detailRequest = useRef(0),
    rangeRequest = useRef(0),
    generation = useRef(0),
    refreshSeq = useRef(0),
    revisionReady = useRef(false),
    inflight = useRef(new Set<string>()),
    locateId = useRef<number | undefined>(undefined),
    visible = useRef<{ first: number; last: number } | null>(null);
  const criteriaRef = useRef(criteria);
  const loadedRef = useRef(loaded);
  const followRef = useRef(follow);
  const selectedRef = useRef(selected);
  criteriaRef.current = criteria;
  loadedRef.current = loaded;
  followRef.current = follow;
  selectedRef.current = selected;
  const refresh = useCallback(() => setLocalRevision((value) => value + 1), []);
  const revision = hostRevision + localRevision;

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  useEffect(() => {
    const sequence = ++request.current;
    generation.current += 1;
    inflight.current.clear();
    visible.current = null;
    setLoading(true);
    setError(null);
    // 时间线定位优先；否则仍在结果里的选中事件保持不动，其余情况停在最新一条。
    const eventId = locateId.current ?? selectedRef.current ?? undefined;
    locateId.current = undefined;
    const showBookkeeping = Boolean(criteria.showBookkeeping);
    void (async () => {
      try {
        const [first, marks] = await Promise.all([
          runQuery(pageQuery(criteria, eventId != null ? { eventId } : { offset: 0, limit: 1 })) as Promise<TracePage>,
          runQuery(compact({ kind: "timeline", showBookkeeping })),
        ]);
        if (sequence !== request.current) return;
        const located = eventId != null && first.events.some((event) => event.id === eventId);
        let window = located ? toWindow(first, first.offset ?? 0) : null;
        if (!located) {
          // 先用一条结果拿到总数，再直接取末尾窗口，避免先把第一段拉进来再丢掉。
          const pages = await Promise.all(
            tailWindowOffsets(first.total, TRACE_WINDOW_SIZE).map((offset) => runQuery(pageQuery(criteria, { offset })) as Promise<TracePage>),
          );
          if (sequence !== request.current) return;
          for (const page of pages) window = mergeTraceWindows(window, page, page.offset ?? 0);
        }
        // 刷新与追加共用一次状态更新，避免先渲染首段再跳到末尾。
        if (window) setLoaded(window);
        setTimeline(marks as { events: TraceEvent[]; truncated: boolean });
        if (eventId != null && !located && selectedRef.current === eventId) setSelected(null);
        setScrollTarget((current) => (located ? { key: current.key + 1, eventId } : { key: current.key + 1, edge: "end" }));
        setLoading(false);
      } catch (caught) {
        if (sequence === request.current) {
          setError(traceErrorCode(caught));
          setLoading(false);
        }
      }
    })();
    return () => {
      request.current++;
    };
  }, [criteria, runQuery]);

  useEffect(() => {
    if (!revisionReady.current) {
      revisionReady.current = true;
      return;
    }
    const seq = ++refreshSeq.current;
    const gen = generation.current;
    const current = loadedRef.current;
    const active = criteriaRef.current;
    const showBookkeeping = Boolean(active.showBookkeeping);
    void runQuery(compact({ kind: "timeline", showBookkeeping })).then((marks) => {
      if (seq !== refreshSeq.current || gen !== generation.current) return;
      setTimeline(marks as { events: TraceEvent[]; truncated: boolean });
    }).catch(() => undefined);
    if (!current) return;
    // 跟随时只刷新末尾两段；否则只刷新可视范围前后各一段，避免已滚过的列表被冲掉，也不把过远窗口全部重取。
    const offsets = followRef.current
      ? tailWindowOffsets(current.total, TRACE_WINDOW_SIZE)
      : visible.current
        ? visibleWindowOffsets(current.total, visible.current.first, visible.current.last, TRACE_WINDOW_SIZE)
        : visibleWindowOffsets(current.total, current.offset, current.offset + Math.max(0, current.events.length - 1), TRACE_WINDOW_SIZE, 0);
    void (async () => {
      try {
        const pages = await Promise.all(
          offsets.map(async (offset) => {
            const page = (await runQuery(pageQuery(active, { offset }))) as TracePage;
            return { page, offset: page.offset ?? offset };
          }),
        );
        if (seq !== refreshSeq.current || gen !== generation.current) return;
        let merged: TraceWindow | null = null;
        for (const item of pages) merged = mergeTraceWindows(merged, item.page, item.offset);
        if (merged) setLoaded(merged);
      } catch (caught) {
        if (seq === refreshSeq.current && gen === generation.current) setError(traceErrorCode(caught));
      }
    })();
  }, [revision, runQuery]);

  useEffect(() => {
    const sequence = ++detailRequest.current;
    setDetail(null);
    setDetailError(null);
    if (selected !== null)
      void runQuery({ kind: "detail", eventId: selected })
        .then((value) => {
          if (sequence === detailRequest.current) setDetail(value as TraceDetail);
        })
        .catch((caught) => {
          if (sequence === detailRequest.current) setDetailError(traceErrorCode(caught));
        });
    return () => {
      detailRequest.current++;
    };
  }, [selected, revision, runQuery]);

  const loadWindow = useCallback(
    (offset: number) => {
      const current = loadedRef.current,
        active = criteriaRef.current;
      if (!current || offset < 0 || offset >= current.total) return;
      const coveredEnd = current.offset + current.events.length;
      if (offset >= current.offset && (offset + TRACE_WINDOW_SIZE <= coveredEnd || coveredEnd >= current.total)) return;
      const requestOffset = offset >= current.offset && offset < coveredEnd ? coveredEnd : offset;
      const key = String(requestOffset);
      if (inflight.current.has(key)) return;
      inflight.current.add(key);
      const gen = generation.current;
      void runQuery(pageQuery(active, { offset: requestOffset }))
        .then((result) => {
          if (gen !== generation.current) return;
          const page = result as TracePage;
          setLoaded((value) => (value ? mergeTraceWindows(value, page, page.offset ?? requestOffset) : value));
        })
        .catch(() => undefined)
        .finally(() => inflight.current.delete(key));
    },
    [runQuery],
  );

  /** first/last 是可视行在全部结果中的绝对下标；未加载的占位区域也会换算成下标，按需取回对应窗口。 */
  const onVisibleEvents = useCallback(
    (first: number, last: number) => {
      visible.current = { first, last };
      const current = loadedRef.current;
      if (!current || !current.total) return;
      const start = Math.max(0, first - PREFETCH_THRESHOLD),
        end = Math.min(current.total - 1, last + PREFETCH_THRESHOLD),
        loadedEnd = current.offset + current.events.length;
      if (start >= current.offset && end < loadedEnd) return;
      if (end < current.offset - TRACE_WINDOW_SIZE || start >= loadedEnd + TRACE_WINDOW_SIZE) {
        // 拖动滚动条跳到远处：直接取可视范围所在的窗口，替换掉不相邻的已加载区间。
        for (const offset of visibleWindowOffsets(current.total, first, last, TRACE_WINDOW_SIZE, 0)) loadWindow(offset);
        return;
      }
      if (start < current.offset) loadWindow(Math.max(0, current.offset - TRACE_WINDOW_SIZE));
      if (end >= loadedEnd && loadedEnd < current.total) loadWindow(loadedEnd);
    },
    [loadWindow],
  );

  function searchInput(value: string) {
    setSearch(value);
    setFollow(false);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setCriteria((current) => ({ ...current, search: value })), SEARCH_DELAY);
  }
  function changeFilter(filter: TraceQuery["filter"]) {
    setCriteria((current) => ({ ...current, filter }));
    setFollow(false);
  }
  function setShowBookkeeping(showBookkeeping: boolean) {
    setCriteria((current) => ({ ...current, showBookkeeping: showBookkeeping || undefined }));
    setFollow(false);
  }
  const select = useCallback((id: number) => {
    setSelected((current) => (current === id ? null : id));
    setFollow(false);
  }, []);
  function jump(id: number) {
    if (selectedRef.current === id) {
      setSelected(null);
      setFollow(false);
      return;
    }
    // 时间线定位优先于尚未提交的搜索，避免防抖回调覆盖目标窗口。
    clearTimeout(searchTimer.current);
    setSearch("");
    setFollow(false);
    locateId.current = id;
    setCriteria((current) => ({ filter: "all", search: "", showBookkeeping: current.showBookkeeping }));
    setSelected(id);
  }
  function setRange(from: string, to: string) {
    setFollow(false);
    setRangeState({ from, to });
    const seq = ++rangeRequest.current,
      gen = generation.current;
    // 一次查询拿到当前结果中第一条命中所在的窗口；已加载的窗口不重取。
    void runQuery(pageQuery(criteriaRef.current, { from, to }))
      .then((result) => {
        if (seq !== rangeRequest.current || gen !== generation.current) return;
        const page = result as TracePage;
        if (page.rangeFirstIndex == null) return;
        const offset = page.offset ?? 0;
        const target = page.events[page.rangeFirstIndex - offset];
        setLoaded((value) => (value ? mergeTraceWindows(value, page, offset) : toWindow(page, offset)));
        if (target) setScrollTarget((current) => ({ key: current.key + 1, eventId: target.id }));
      })
      .catch(() => undefined);
  }
  function clearRange() {
    rangeRequest.current++;
    setRangeState(null);
  }
  function changeFollow(next: boolean) {
    setFollow(next);
    if (!next) return;
    const current = loadedRef.current;
    if (!current || !current.total) return;
    for (const offset of tailWindowOffsets(current.total, TRACE_WINDOW_SIZE)) loadWindow(offset);
  }
  return {
    events: loaded?.events ?? [],
    offset: loaded?.offset ?? 0,
    total: loaded?.total ?? 0,
    stats: loaded?.stats,
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
    filter: criteria.filter,
    showBookkeeping: Boolean(criteria.showBookkeeping),
    searchInput,
    changeFilter,
    setShowBookkeeping,
    select,
    jump,
    setRange,
    clearRange,
    setFollow: changeFollow,
    refresh,
    onVisibleEvents,
  };
}
