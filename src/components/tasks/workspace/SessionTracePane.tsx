import { extensionErrorKeys } from "@/services/extensionErrorMessages";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getExtensionsApi, extensionErrorCode } from "@/services/extensionsApi";
import type { TaskSession } from "@/shared/taskSessionTypes";
import type { TraceQuery } from "@/shared/extensionTypes";
import { Button } from "@/components/ui/button";

interface SessionTracePaneProps {
  /** 只读查看已绑定的原生会话；不执行恢复或终端写入。 */
  session: TaskSession;
  /** 当前视图真正可见时才持有解析租约。 */
  visible: boolean;
}
export function SessionTracePane({ session, visible }: SessionTracePaneProps) {
  const { t, i18n } = useTranslation(["common", "settings"]);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<ReturnType<typeof extensionErrorCode> | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let disposed = false,
      leaseId: string | undefined,
      observer: MutationObserver | undefined;
    let offChanged: (() => void) | undefined,
      requests = 0;
    const api = getExtensionsApi();
    setError(null);
    setUrl(undefined);
    const send = (value: unknown) => frameRef.current?.contentWindow?.postMessage(value, "navo-extension://session-trace");
    function appearance() {
      const styles = getComputedStyle(document.documentElement);
      const tokens = Object.fromEntries(
        ["background", "foreground", "muted", "muted-foreground", "border", "accent", "destructive"].map((name) => [
          name,
          styles.getPropertyValue("--" + name).trim(),
        ]),
      );
      send({ type: "appearance", locale: i18n.resolvedLanguage, dark: document.documentElement.classList.contains("dark"), tokens });
    }
    async function receive(event: MessageEvent) {
      if (disposed || event.source !== frameRef.current?.contentWindow || event.origin !== "navo-extension://session-trace" || !leaseId)
        return;
      const data = event.data;
      if (data?.type === "ready") {
        appearance();
        send({ type: "refresh" });
        return;
      }
      if (data?.type !== "query" || !Number.isSafeInteger(data.id) || requests >= 8) return;
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
    void api
      .openTrace(session.id)
      .then((lease) => {
        if (disposed) {
          void api.closeTrace(lease.id);
          return;
        }
        leaseId = lease.id;
        setUrl(lease.uiUrl);
        offChanged = api.onTraceChanged((update) => {
          if (update.leaseId !== lease.id) return;
          if (update.error) setError(extensionErrorCode(Error(update.error)));
          else send({ type: "refresh" });
        });
        observer = new MutationObserver(appearance);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
      })
      .catch((caught) => {
        if (!disposed) setError(extensionErrorCode(caught));
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      offChanged?.();
      window.removeEventListener("message", receive);
      if (leaseId) void api.closeTrace(leaseId);
    };
  }, [session.id, session.nativeSessionId, visible, attempt, i18n.resolvedLanguage, i18n]);
  if (!visible) return null;
  if (error)
    return (
      <div className="task-session-empty">
        <p role="alert">{t(extensionErrorKeys[error])}</p>
        <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
          {t("settings:labs.retry")}
        </Button>
      </div>
    );
  return url ? (
    <iframe
      ref={frameRef}
      title={t("settings:labs.traceTitle")}
      src={url}
      sandbox="allow-scripts allow-same-origin"
      className="min-h-0 w-full flex-1 border-0"
    />
  ) : (
    <div className="task-session-empty">{t("settings:labs.loading")}</div>
  );
}
