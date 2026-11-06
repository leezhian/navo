import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { extensionErrorCode, getExtensionsApi } from "@/services/extensionsApi";
import type { TaskSession } from "@/shared/taskSessionTypes";
import type { TraceQuery } from "@/shared/extensionTypes";

const TRACE_ORIGIN = "navo-extension://session-trace";
const MAX_PENDING_QUERIES = 8;

function isTraceMessage(event: MessageEvent, frame: HTMLIFrameElement | null) {
  return Boolean(frame && event.source === frame.contentWindow && event.origin === TRACE_ORIGIN);
}

/** 可见视图持有独立租约；外观更新只发送消息，不重建会话或 iframe。 */
export function useSessionTraceBridge(session: TaskSession, visible: boolean) {
  const { i18n } = useTranslation();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<ReturnType<typeof extensionErrorCode> | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const api = getExtensionsApi();
    // 在打开请求前确定 ID，首次索引尚未完成时也能释放这次请求。
    const leaseId = crypto.randomUUID();
    let disposed = false;
    let requests = 0;
    let offChanged: (() => void) | undefined;
    const close = () => void api.closeTrace(leaseId).catch(() => undefined);
    const send = (value: unknown) => frameRef.current?.contentWindow?.postMessage(value, TRACE_ORIGIN);
    setError(null);
    setUrl(undefined);

    async function receive(event: MessageEvent) {
      if (disposed || !isTraceMessage(event, frameRef.current)) return;
      const data = event.data;
      if (data?.type === "ready") {
        send({ type: "refresh" });
        return;
      }
      if (data?.type !== "query" || !Number.isSafeInteger(data.id) || requests >= MAX_PENDING_QUERIES) return;
      requests++;
      try {
        const result = await api.queryTrace(leaseId, data.query as TraceQuery);
        if (!disposed) send({ type: "result", id: data.id, result });
      } catch (caught) {
        if (!disposed) send({ type: "result", id: data.id, error: extensionErrorCode(caught) });
      } finally {
        requests--;
      }
    }
    window.addEventListener("message", receive);
    void api.openTrace(session.id, leaseId)
      .then((lease) => {
        if (disposed) {
          close();
          return;
        }
        setUrl(lease.uiUrl);
        offChanged = api.onTraceChanged((update) => {
          if (update.leaseId !== leaseId) return;
          if (update.error) setError(extensionErrorCode(Error(update.error)));
          else send({ type: "refresh" });
        });
      })
      .catch((caught) => {
        if (!disposed) setError(extensionErrorCode(caught));
      });
    return () => {
      disposed = true;
      offChanged?.();
      window.removeEventListener("message", receive);
      close();
    };
  }, [session.id, session.nativeSessionId, visible, attempt]);

  useEffect(() => {
    if (!visible) return;
    function appearance() {
      const styles = getComputedStyle(document.documentElement);
      const tokens = Object.fromEntries(
        ["background", "foreground", "muted", "muted-foreground", "border", "accent", "destructive"].map((name) => [
          name,
          styles.getPropertyValue("--" + name).trim(),
        ]),
      );
      frameRef.current?.contentWindow?.postMessage({
        type: "appearance",
        locale: i18n.resolvedLanguage,
        dark: document.documentElement.classList.contains("dark"),
        tokens,
      }, TRACE_ORIGIN);
    }
    function ready(event: MessageEvent) {
      if (isTraceMessage(event, frameRef.current) && event.data?.type === "ready") appearance();
    }
    // 首次握手、语言切换和主题变化都复用当前页面，保留其阅读状态。
    window.addEventListener("message", ready);
    const observer = new MutationObserver(appearance);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    appearance();
    return () => {
      observer.disconnect();
      window.removeEventListener("message", ready);
    };
  }, [visible, i18n.resolvedLanguage, i18n]);

  return { frameRef, url, error, retry: () => setAttempt((value) => value + 1) };
}
