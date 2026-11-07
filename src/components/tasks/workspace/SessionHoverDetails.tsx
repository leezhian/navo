import { useTranslation } from "react-i18next";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { taskTimeLabel } from "@/utils/taskTime";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReactElement } from "react";

interface SessionHoverDetailsProps {
  /** 活动会话条目悬停详情；不含用量／token，无字段则省略该行。 */
  session: TaskSession;
  workspaceLabel: string;
  /** 保留原按钮的点击与截断标题行为。 */
  children: ReactElement;
  unread: boolean;
}

export function SessionHoverDetails({ session, workspaceLabel, children, unread }: SessionHoverDetailsProps) {
  const { t, i18n } = useTranslation(["tasks", "common"]);
  const now = useMinuteClock();
  const active = taskTimeLabel(session.lastActiveAt, now);
  const activeText = active.kind === "absolute" ? active.text : t(`tasks:time.${active.unit}`, { count: active.count });
  const fullActive = new Intl.DateTimeFormat(i18n.language, {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(new Date(session.lastActiveAt));
  const rows = [
    { key: "active", label: t("tasks:runtime.hover.lastActive"), value: activeText, title: fullActive },
    { key: "workspace", label: t("tasks:runtime.hover.workspace"), value: workspaceLabel },
    { key: "status", label: t("tasks:runtime.hover.status"), value: t(`tasks:runtime.status.${session.status}`) },
  ];
  if (session.phase) rows.push({ key: "phase", label: t("tasks:runtime.hover.phase"), value: t(`tasks:runtime.phase.${session.phase}`) });
  if (session.waitingReason) rows.push({ key: "waiting", label: t("tasks:runtime.hover.waitingReason"), value: session.waitingReason });
  if (unread) rows.push({ key: "unread", label: t("tasks:runtime.hover.unread"), value: t("tasks:runtime.status.unread") });
  return <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side="right" className="max-w-64">
      <dl className="grid gap-1 text-xs">
        {rows.map((row) => <div key={row.key} className="grid grid-cols-[auto_1fr] gap-x-2">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 truncate" title={"title" in row ? row.title : row.value}>{row.value}</dd>
        </div>)}
      </dl>
    </TooltipContent>
  </Tooltip>;
}
