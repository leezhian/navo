import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { ChartNoAxesGantt, Play, SquareTerminal, X } from "lucide-react";
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
import { useSessionAutoRead } from "@/hooks/useSessionAutoRead";

/** 首次打开轨迹时再加载界面代码，插件未启用时不会下载或执行这段模块。 */
const SessionTracePane = lazy(() => import("./SessionTracePane").then((module) => ({ default: module.SessionTracePane })));

interface AgentSessionPaneProps {
  /** 当前选中的 Agent 会话；普通 Shell 在下方独立展示。 */
  task: Task;
  session?: TaskSession;
  /** 加号及空态复用同一个 Agent 选择菜单，选择后使用 CLI 默认配置创建。 */
  newSessionControl: ReactNode;
  emptySessionControl: ReactNode;
  /** 仅隐藏当前面板，不停止、归档或删除会话。 */
  onClosePane: () => void;
  /** 实验室安装并启用且当前 Agent 支持时展示轨迹入口。 */
  traceAvailable?: boolean;
  /** 父工作台持有视图状态，用于禁止历史浏览触发自动恢复。 */
  traceSelected?: boolean;
  /** 用户主动选择终端时解除自动回退带来的恢复抑制。 */
  onViewChange?: (trace: boolean) => void;
  /** 抽屉、终端最大化和任务隐藏时释放轨迹订阅。 */
  visible?: boolean;
}
export function AgentSessionPane({ task, session, newSessionControl, emptySessionControl, onClosePane, traceAvailable = false, traceSelected = false, onViewChange, visible = true }: AgentSessionPaneProps) {
  const { t } = useTranslation(["common", "tasks", "settings"]);
  const resumeHintId = useId();
  const paneRef = useRef<HTMLElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    if (!paneRef.current) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0));
    observer.observe(paneRef.current); return () => observer.disconnect();
  }, []);
  const pending = useTaskSessionStore((state) => state.pending);
  const running = session?.status === "running" || session?.status === "starting";
  const canResume = Boolean(session?.resumable && session.nativeSessionId);
  const sessionName = session?.title || t("tasks:runtime.untitledSession");
  const traceLeaseVisible = visible && onScreen;
  useSessionAutoRead(session, traceLeaseVisible);
  return <section ref={paneRef} className="task-workbench-panel task-agent-pane">
    <header className="task-workbench-panel-heading">
      <div className="flex min-w-0 items-center gap-2"><SessionStatusIcon status={session?.status} />{session && <AgentProviderIcon agentId={session.agent?.agentId} />}<span className="truncate text-xs" title={session ? sessionName : undefined}>{session ? sessionName : t("tasks:runtime.sessions")}</span></div>
      <div className="flex shrink-0 items-center gap-1">
        {traceAvailable && <SessionViewSwitch traceSelected={traceSelected} onViewChange={onViewChange} />}
        {session && <TaskSessionContextAction key={session.id + session.terminalId} session={session} archived={task.status === "ARCHIVED"} />}
        {newSessionControl}
        {session && <><SessionActionMenu key={session.id} session={session} taskArchived={task.status === "ARCHIVED"} /><IconTooltip label={t("tasks:runtime.closePane")} size="icon-xs" onClick={onClosePane}><X className="size-3.5" /></IconTooltip></>}
      </div>
    </header>
    {session && traceAvailable && <TraceKeepAlive key={session.id} session={session} selected={traceSelected} visible={traceLeaseVisible} />}
    <div className="min-h-0 flex-1 flex-col" style={{ display: traceSelected ? "none" : "flex" }}>
    {session?.error && <p role="alert" className="px-3 py-2 text-xs text-destructive">{t(session.error === "SESSION_MODE_UNSUPPORTED" ? "tasks:runtime.modeUnsupported" : session.error === "SESSION_OPTION_UNSUPPORTED" ? "tasks:runtime.optionUnsupported" : "tasks:runtime.startFailed")}</p>}
    {session && !running && <div className="flex shrink-0 flex-col items-start gap-1 px-3 py-2">
      <Button variant="ghost" size="sm" className="text-xs" disabled={pending || task.status === "ARCHIVED" || !canResume} aria-describedby={!canResume ? resumeHintId : undefined} onClick={() => void useTaskSessionStore.getState().restart(session.id, true)}><Play className="size-3.5" />{t("tasks:runtime.resume")}</Button>
      {!canResume && <p id={resumeHintId} className="text-xs text-muted-foreground">{t("tasks:runtime.resumeUnavailable")}</p>}
    </div>}
    {session && (session.status === "running" || hasManagedTerminalSession(session.terminalId)) ? <TerminalWorkspace key={session.terminalId} title={sessionName} sessionId={session.terminalId} cwd={session.cwd} compact attachOnly /> :
      <div className="task-session-empty">{!session && <><p className="whitespace-pre-wrap break-words">{task.description || task.title}</p>{emptySessionControl}</>}</div>}
    </div>
  </section>;
}

interface SessionViewSwitchProps {
  /** 当前是否在看轨迹；false 表示 Agent CLI 终端视图。 */
  traceSelected: boolean;
  /** 切换视图，trace=false 代表用户主动选择终端（会解除自动回退的恢复抑制）。 */
  onViewChange?: (trace: boolean) => void;
}

/** 标题栏内的终端/轨迹图标分段切换，替代原先标题栏下方的一行 tab。 */
function SessionViewSwitch({ traceSelected, onViewChange }: SessionViewSwitchProps) {
  const { t } = useTranslation(["settings"]);
  const itemClass = (selected: boolean) => selected ? "bg-accent text-foreground" : "";
  return <div role="group" aria-label={t("settings:labs.view")} className="flex items-center gap-0.5 rounded-md">
    <IconTooltip label={t("settings:labs.terminal")} size="icon-xs" aria-pressed={!traceSelected} data-selected={!traceSelected} className={itemClass(!traceSelected)} onClick={() => onViewChange?.(false)}><SquareTerminal className="size-3.5" /></IconTooltip>
    <IconTooltip label={t("settings:labs.trace")} size="icon-xs" aria-pressed={traceSelected} data-selected={traceSelected} className={itemClass(traceSelected)} onClick={() => onViewChange?.(true)}><ChartNoAxesGantt className="size-3.5" /></IconTooltip>
  </div>;
}

interface TraceKeepAliveProps {
  session: TaskSession;
  /** 当前是否选中轨迹视图；未选中时只隐藏不卸载。 */
  selected: boolean;
  /** 面板真正可见时才持有轨迹租约。 */
  visible: boolean;
}
/** 首次打开轨迹后保持挂载：终端↔轨迹只切换显示，避免释放租约、结束解析进程。换会话（key）或关闭插件（父级不渲染）时自然卸载。 */
function TraceKeepAlive({ session, selected, visible }: TraceKeepAliveProps) {
  const [mounted, setMounted] = useState(selected);
  if (selected && !mounted) setMounted(true);
  if (!mounted) return null;
  return <div className="min-h-0 flex-1 flex-col" style={{ display: selected ? "flex" : "none" }} aria-hidden={!selected}>
    <Suspense fallback={<div className="task-session-empty" />}>
      <SessionTracePane session={session} visible={visible} />
    </Suspense>
  </div>;
}
