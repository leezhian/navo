import { Play, RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { TerminalWorkspace } from "@/components/terminal/TerminalWorkspace";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { SessionStatusIcon } from "./SessionStatusIcon";
import { SessionActionMenu } from "./SessionActionMenu";
import { AgentProviderIcon } from "./AgentProviderIcon";
import { hasManagedTerminalSession } from "@/components/terminal/terminalSessionManager";
import { TaskSessionContextAction } from "./TaskSessionContextAction";

interface AgentSessionPaneProps {
  /** 当前选中的 Agent 会话；普通 Shell 在下方独立展示。 */
  task: Task;
  session?: TaskSession;
  /** 加号及空态复用同一个 Agent 选择菜单，选择后使用 CLI 默认配置创建。 */
  newSessionControl: ReactNode;
  emptySessionControl: ReactNode;
  /** 仅隐藏当前面板，不停止、归档或删除会话。 */
  onClosePane: () => void;
}
export function AgentSessionPane({ task, session, newSessionControl, emptySessionControl, onClosePane }: AgentSessionPaneProps) {
  const { t } = useTranslation(["common", "tasks"]);
  const pending = useTaskSessionStore((state) => state.pending);
  const running = session?.status === "running" || session?.status === "starting";
  const sessionName = session?.title || t("tasks:runtime.untitledSession");
  return <section className="task-workbench-panel task-agent-pane">
    <header className="task-workbench-panel-heading">
      <div className="flex min-w-0 items-center gap-2"><SessionStatusIcon status={session?.status} />{session && <AgentProviderIcon agentId={session.agent?.agentId} />}<span className="truncate text-xs" title={session ? sessionName : undefined}>{session ? sessionName : t("tasks:runtime.sessions")}</span></div>
      <div className="flex shrink-0 items-center gap-1">
        {session && <TaskSessionContextAction key={session.id + session.terminalId} session={session} archived={task.status === "ARCHIVED"} />}
        {newSessionControl}
        {session && <><SessionActionMenu key={session.id} session={session} /><IconTooltip label={t("tasks:runtime.closePane")} size="icon-xs" onClick={onClosePane}><X className="size-3.5" /></IconTooltip></>}
      </div>
    </header>
    {session?.error && <p role="alert" className="px-3 py-2 text-xs text-destructive">{t(session.error === "SESSION_MODE_UNSUPPORTED" ? "tasks:runtime.modeUnsupported" : session.error === "SESSION_OPTION_UNSUPPORTED" ? "tasks:runtime.optionUnsupported" : "tasks:runtime.startFailed")}</p>}
    {session && !running && <div className="flex shrink-0 gap-2 px-3 py-2">
      {session.resumable && <Button variant="ghost" size="sm" className="text-xs" disabled={pending} onClick={() => void useTaskSessionStore.getState().restart(session.id, true)}><Play className="size-3.5" />{t("tasks:runtime.resume")}</Button>}
      <Button variant="ghost" size="sm" className="text-xs" disabled={pending} onClick={() => void useTaskSessionStore.getState().restart(session.id, false)}><RotateCcw className="size-3.5" />{t("tasks:runtime.restart")}</Button>
    </div>}
    {session && (session.status === "running" || hasManagedTerminalSession(session.terminalId)) ? <TerminalWorkspace key={session.terminalId} title={sessionName} sessionId={session.terminalId} cwd={session.cwd} compact attachOnly /> :
      <div className="task-session-empty">{!session && <><p className="whitespace-pre-wrap break-words">{task.description || task.title}</p>{emptySessionControl}</>}</div>}
  </section>;
}
