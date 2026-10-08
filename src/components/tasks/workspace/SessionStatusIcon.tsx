import { Circle, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskSessionStatus } from "@/shared/taskSessionTypes";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { taskSessionSummary } from "@/utils/taskSessionSummary";

interface SessionStatusIconProps {
  /** 未创建会话时使用空心圆；不能以任务 TODO/DONE 代替会话状态。 */
  status?: TaskSessionStatus;
}
export function SessionStatusIcon({ status }: SessionStatusIconProps) {
  const { t } = useTranslation(["common", "tasks"]);
  const Icon = status === "starting" ? LoaderCircle : status === "failed" ? CircleAlert : status === "stopped" ? CircleCheck : Circle;
  return <span className="task-session-status" data-status={status ?? "idle"} role="img" aria-label={t(`tasks:runtime.status.${status ?? "idle"}`)} title={t(`tasks:runtime.status.${status ?? "idle"}`)}><Icon className="size-3.5 shrink-0" /></span>;
}

export function TaskSessionStatusIcon({ taskId }: { /** 聚合此任务所有会话的真实状态。 */ taskId: string }) {
  const status = useTaskSessionStore((state) => taskSessionSummary(state.sessions, taskId).status);
  return <SessionStatusIcon status={status} />;
}
