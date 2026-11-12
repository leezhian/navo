import { useTranslation } from "react-i18next";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { Button } from "@/components/ui/button";
import { SessionTraceView } from "./trace/SessionTraceView";
import { TraceError } from "./trace/TraceError";
import { useSessionTrace } from "./trace/useSessionTrace";

interface SessionTracePaneProps {
  /** 只读查看已绑定的原生会话；不执行恢复或终端写入。 */
  session: TaskSession;
  /** 会话面板真正可见时才持有解析租约；终端↔轨迹切换应保持挂载，由父级控制显隐。 */
  visible: boolean;
}
export function SessionTracePane({ session, visible }: SessionTracePaneProps) {
  const { t } = useTranslation(["common", "settings", "trace"]);
  const { query, revision, error, retry } = useSessionTrace(session, visible);
  if (!visible) return null;
  if (error)
    return (
      <div className="task-session-empty" role="alert">
        <TraceError code={error} />
        <Button variant="outline" size="sm" onClick={retry}>
          {t("trace:retry")}
        </Button>
      </div>
    );
  return query ? (
    <SessionTraceView query={query} revision={revision} />
  ) : (
    <div className="task-session-empty">{t("settings:labs.loading")}</div>
  );
}
