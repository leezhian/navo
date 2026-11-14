import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { TaskResource } from "@/shared/taskTypes";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { agentNames } from "@/domain/agents";
import { taskTimeLabel } from "@/utils/taskTime";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { sessionActivityText } from "@/utils/sessionActivityLabel";
import { sessionLaunchConfig } from "@/utils/sessionLaunchConfig";
import { sessionContextPercent } from "@/utils/sessionUsageLabel";
import { sessionHoverPlace, shortenPath } from "@/utils/taskSessionWorkspace";

interface SessionHoverDetailsProps {
  /** 会话条目悬停卡。全部工作树会话不展示项目、分支和路径。 */
  session: TaskSession;
  /** 用来解析项目名、分支和实际目录；不根据资源数量猜测范围。 */
  resources: TaskResource[];
  /** 保留原按钮的点击与截断标题行为。 */
  children: ReactElement;
}

export function SessionHoverDetails({ session, resources, children }: SessionHoverDetailsProps) {
  const { t, i18n } = useTranslation(["tasks", "common"]);
  const now = useMinuteClock();
  const activity = sessionActivityText(session);
  const status = "reason" in activity ? t(activity.key, { reason: activity.reason }) : t(activity.key);
  const config = sessionLaunchConfig(session.agent);
  const configLine = [session.agent ? agentNames[session.agent.agentId] : "", config].filter(Boolean).join("  ");
  const percent = sessionContextPercent(session.usage);
  const place = sessionHoverPlace(session, resources);
  const timeText = (value: string) => {
    const label = taskTimeLabel(value, now);
    return label.kind === "absolute" ? label.text : t(`tasks:time.${label.unit}`, { count: label.count });
  };
  const fullTime = (value: string) => new Intl.DateTimeFormat(i18n.language, {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(new Date(value));
  const times = [
    session.lastReplyAt ? { key: "reply", label: t("tasks:runtime.hover.lastReply"), value: session.lastReplyAt } : null,
    session.lastPromptAt ? { key: "prompt", label: t("tasks:runtime.hover.lastPrompt"), value: session.lastPromptAt } : null,
  ].filter((item) => item !== null);
  return <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side="right" sideOffset={8} className="flex w-72 max-w-72 flex-col items-stretch gap-2 p-3 text-left">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" title={session.title || undefined}>{session.title || t("tasks:runtime.untitledSession")}</p>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-background/75">
          <span className="size-1.5 shrink-0 rounded-full border border-current" data-status={session.status} />
          <span className="truncate">{status}</span>
        </p>
        {configLine && <p className="mt-2 truncate text-background/90" title={configLine}>{configLine}</p>}
        {percent !== undefined && <p className="mt-1 text-background/75">{t("tasks:runtime.hover.contextPercent", { percent })}</p>}
      </div>
      {place && (place.project || place.branch || place.path) && <div className="min-w-0 border-t border-background/15 pt-2">
        {place.project && <p className="truncate text-background/70">{place.project}</p>}
        {place.branch && <p className="truncate font-medium">{place.branch}</p>}
        {place.path && <p className="truncate text-background/60" title={place.path}>{shortenPath(place.path)}</p>}
      </div>}
      {times.length > 0 && <dl className="grid gap-1 border-t border-background/15 pt-2">
        {times.map((item) => <div key={item.key} className="flex items-baseline justify-between gap-3">
          <dt className="text-background/70">{item.label}</dt>
          <dd title={fullTime(item.value)}>{timeText(item.value)}</dd>
        </div>)}
      </dl>}
    </TooltipContent>
  </Tooltip>;
}
