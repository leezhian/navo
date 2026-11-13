import type { ReactNode } from "react";
import { PanelBottomClose, Maximize2, Minimize2, Terminal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { TerminalWorkspace } from "@/components/terminal/TerminalWorkspace";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { hasManagedTerminalSession } from "@/components/terminal/terminalSessionManager";

interface TaskTerminalDrawerProps {
  /** 任务内的普通终端，与上下文分组共享同一数据源。 */
  sessions: TaskSession[];
  activeId?: string;
  expanded: boolean;
  onSelect: (id: string) => void;
  /** 与上下文分组共用的工作目录选择及新建入口。 */
  newTerminalControl: ReactNode;
  onExpand: () => void;
  /** 收起不终止进程；每个标签的关闭操作则终止进程树。 */
  onCollapse: () => void;
}
export function TaskTerminalDrawer({ sessions, activeId, expanded, onSelect, newTerminalControl, onExpand, onCollapse }: TaskTerminalDrawerProps) {
  const { t } = useTranslation(["common", "tasks"]);
  const active = sessions.find((session) => session.id === activeId) ?? sessions[0];
  const pending = useTaskSessionStore((state) => state.pending);
  return <section className="task-workbench-panel task-shell-pane">
    <header className="task-workbench-panel-heading">
      <div className="task-shell-tabs">{sessions.map((session) => <div key={session.id} className="task-shell-tab" data-active={session.id === active?.id}>
        <button onClick={() => onSelect(session.id)}><Terminal className="size-3" /><span>{session.title}</span></button>
        <button aria-label={t("tasks:runtime.closeTerminal", { name: session.title })} disabled={pending} onClick={() => void useTaskSessionStore.getState().stop(session.id)}><X className="size-3" /></button>
      </div>)}</div>
      <div className="flex shrink-0 items-center gap-1">
        {newTerminalControl}
        <IconTooltip label={t(expanded ? "tasks:runtime.restoreTerminal" : "tasks:runtime.expandTerminal")} size="icon-xs" onClick={onExpand}>{expanded ? <Minimize2 /> : <Maximize2 />}</IconTooltip>
        <IconTooltip label={t("tasks:runtime.hideTerminal")} size="icon-xs" onClick={onCollapse}><PanelBottomClose /></IconTooltip>
      </div>
    </header>
    {active && (active.status === "running" || active.commandExitCode !== undefined || hasManagedTerminalSession(active.terminalId)) ? <TerminalWorkspace key={active.terminalId} title={active.title} sessionId={active.terminalId} cwd={active.cwd} compact attachOnly autoFocus={!active.command} /> :
      <div className="task-session-empty"><p>{t(active?.status === "failed" ? "tasks:runtime.startFailed" : "tasks:runtime.status.stopped")}</p></div>}
  </section>;
}
