import { extensionErrorKeys } from "@/services/extensionErrorMessages";
import { useTranslation } from "react-i18next";
import { useSessionTraceBridge } from "@/hooks/useSessionTraceBridge";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { Button } from "@/components/ui/button";

interface SessionTracePaneProps {
  /** 只读查看已绑定的原生会话；不执行恢复或终端写入。 */
  session: TaskSession;
  /** 当前视图真正可见时才持有解析租约。 */
  visible: boolean;
}
export function SessionTracePane({ session, visible }: SessionTracePaneProps) {
  const { t } = useTranslation(["common", "settings"]);
  const { frameRef, url, error, retry } = useSessionTraceBridge(session, visible);
  if (!visible) return null;
  if (error)
    return (
      <div className="task-session-empty">
        <p role="alert">{t(extensionErrorKeys[error])}</p>
        <Button variant="outline" size="sm" onClick={retry}>
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
