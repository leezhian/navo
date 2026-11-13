import { useCallback, useEffect, useState } from "react";
import { getExtensionsApi } from "@/services/extensionsApi";
import { traceErrorCode } from "./TraceError";
import type { TaskSession } from "@/shared/taskSessionTypes";
import type { TraceQuery, TraceResult } from "@/shared/extensionTypes";

export type TraceQueryFn = (query: TraceQuery) => Promise<TraceResult>;

/** 可见视图持有独立租约；查询直接走宿主受限 API，变化通知只递增 revision，不重建界面。 */
export function useSessionTrace(session: TaskSession, visible: boolean) {
  const [query, setQuery] = useState<TraceQueryFn | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<ReturnType<typeof traceErrorCode> | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const api = getExtensionsApi();
    // 在打开请求前确定 ID，首次索引尚未完成时也能释放这次请求。
    const leaseId = crypto.randomUUID();
    let disposed = false;
    // pending：打开尚未返回，卸载时仍要 close 以便宿主取消这次请求。
    // cancelled：打开已按取消返回，租约从未建成，不能再关。
    let lease: "pending" | "open" | "cancelled" | "closed" = "pending";
    let offChanged: (() => void) | undefined;
    const close = () => {
      if (lease === "cancelled" || lease === "closed") return;
      lease = "closed";
      void api.closeTrace(leaseId).catch(() => undefined);
    };
    setError(null);
    setQuery(null);
    void api.openTrace(session.id, leaseId)
      .then((result) => {
        if (result.cancelled) {
          if (lease !== "closed") lease = "cancelled";
          return;
        }
        if (disposed) {
          close();
          return;
        }
        lease = "open";
        offChanged = api.onTraceChanged((update) => {
          if (update.leaseId !== leaseId) return;
          if (update.error) setError(traceErrorCode(Error(update.error)));
          else setRevision((value) => value + 1);
        });
        setQuery(() => (value: TraceQuery) => api.queryTrace(leaseId, value));
      })
      .catch((caught) => {
        if (!disposed) setError(traceErrorCode(caught));
      });
    return () => {
      disposed = true;
      offChanged?.();
      setQuery(null);
      close();
    };
  }, [session.id, session.nativeSessionId, visible, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { query, revision, error, retry };
}
