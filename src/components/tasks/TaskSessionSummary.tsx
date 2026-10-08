import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { Circle, CircleAlert, LoaderCircle } from "lucide-react";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { countTaskSessions, TASK_SESSION_GROUP_ORDER } from "@/utils/taskSessionSummary";
import type { TaskSessionStatus } from "@/shared/taskSessionTypes";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import "./task-session-summary.css";

interface SessionGroupIconProps {
  /** 启动和运行是活跃状态；失败、停止保留空心静态标识，不能误示为运行中。 */
  status: TaskSessionStatus;
}
function SessionGroupIcon({ status }: SessionGroupIconProps) {
  const Icon = status === "starting" ? LoaderCircle : status === "failed" ? CircleAlert : Circle;
  return <Icon className="task-session-group-icon" data-status={status} aria-hidden="true" />;
}

interface TaskSessionSummaryProps {
  /** 当前任务 ID；实时汇总未归档 Agent 会话，不包含普通 Shell。 */
  taskId: string;
}
export function TaskSessionSummary({ taskId }: TaskSessionSummaryProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const counts = useTaskSessionStore(useShallow((state) => countTaskSessions(state.sessions, taskId)));
  const groups = TASK_SESSION_GROUP_ORDER.filter((status) => counts[status] > 0).map((status) => ({
    status, count: counts[status], label: t("tasks:sessionSummary.tally", { count: counts[status], status: t(`tasks:runtime.status.${status}`) }),
  }));
  if (!groups.length) return null;
  const total = groups.reduce((count, group) => count + group.count, 0);
  const label = [t("tasks:sessionSummary.label", { count: total }), ...groups.map((group) => group.label)].join(" · ");
  return <Tooltip><TooltipTrigger asChild>
    <span className="task-session-summary" role="img" aria-label={label}>
      {groups.map(({ status, count }) => <span key={status} className="task-session-group" data-status={status} aria-hidden="true">
        <SessionGroupIcon status={status} />{count > 1 && <span className="task-session-group-count">{count}</span>}
      </span>)}
    </span>
  </TooltipTrigger><TooltipContent><span className="flex flex-col gap-1">
    {groups.map(({ status, label }) => <span key={status} className="task-session-tally"><SessionGroupIcon status={status} /><span>{label}</span></span>)}
  </span></TooltipContent></Tooltip>;
}
