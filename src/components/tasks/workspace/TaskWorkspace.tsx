import { useEffect, useRef, useState } from "react";
import { PanelLeft, SquareArrowOutUpRight, Terminal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import type { TaskResource } from "@/shared/taskTypes";
import type { TaskSession } from "@/shared/taskSessionTypes";
import type { ReviewSession } from "@/domain/types";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { getTaskSessionsApi } from "@/services/taskSessionApi";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ReviewDialog } from "@/components/review/ReviewDialog";
import { useLocalSettings } from "@/hooks/useLocalSettings";
import { TaskResourceRail } from "./TaskResourceRail";
import { AgentSessionPane } from "./AgentSessionPane";
import { TaskTerminalDrawer } from "./TaskTerminalDrawer";
import { NewSessionMenu } from "./NewSessionMenu";
import { useSessionAgentChoices } from "@/hooks/useSessionAgentChoices";
import type { AgentId } from "@/shared/agentTypes";
import { WorkspaceSeparator } from "./WorkspaceSeparator";
import "./task-workspace.css";

interface TaskWorkspaceProps {
  /** 任务侧栏、独立标签与拆分页复用同一工作台，业务会话位于应用级 store。 */
  task: Task;
  headingId: string;
  onClose: () => void;
  /** 只在任务侧栏展示提升为标签页的入口。 */
  onOpenPage?: () => void;
}
export function TaskWorkspace({ task, headingId, onClose, onOpenPage }: TaskWorkspaceProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const { settings, resolvedTheme, updateSettings } = useLocalSettings();
  const allSessions = useTaskSessionStore((state) => state.sessions);
  const pending = useTaskSessionStore((state) => state.pending);
  const error = useTaskSessionStore((state) => state.error);
  const sessions = allSessions.filter((session) => session.taskId === task.id && !session.archivedAt);
  const terminals = sessions.filter((session) => session.kind === "shell");
  const agents = sessions.filter((session) => session.kind === "agent");
  const [selectedAgent, setSelectedAgent] = useState<string>();
  const [agentPaneOpen, setAgentPaneOpen] = useState(true);
  const agentViewRevision = useRef(0);
  const agentChoices = useSessionAgentChoices();
  const [selectedTerminal, setSelectedTerminal] = useState<string>();
  const terminalViewRevision = useRef(0);
  const active = agents.find((session) => session.id === selectedAgent) ?? agents[agents.length - 1];
  const activeTerminal = terminals.find((session) => session.id === selectedTerminal) ?? terminals[0];
  const [contextOpen, setContextOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [railWidth, setRailWidth] = useState(216);
  const [terminalHeight, setTerminalHeight] = useState(192);
  const [narrow, setNarrow] = useState(false);
  const [preview, setPreview] = useState<{ title: string; body: string } | null>(null);
  const [review, setReview] = useState<ReviewSession | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const visibleTerminal = terminalOpen && terminals.length > 0;
  const showAgentPane = agentPaneOpen && (!expanded || !visibleTerminal);
  const terminalFillsSpace = expanded || !agentPaneOpen;

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth > 0) setNarrow(element.clientWidth < 620);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setContextOpen(!narrow); }, [narrow]);
  useEffect(() => { if (!terminals.length) setExpanded(false); }, [terminals.length]);

  async function addTerminal() {
    const store = useTaskSessionStore.getState();
    if (store.pending) return;
    const revision = ++terminalViewRevision.current;
    const previousIds = new Set(store.sessions.map((session) => session.id));
    await store.start({ taskId: task.id, kind: "shell" });
    const created = useTaskSessionStore.getState().sessions.find((session) => session.taskId === task.id && session.kind === "shell" && !previousIds.has(session.id));
    if (created && revision === terminalViewRevision.current) { setSelectedTerminal(created.id); setTerminalOpen(true); }
  }
  function selectContextSession(session: TaskSession) {
    if (session.kind === "agent") {
      agentViewRevision.current += 1;
      setAgentPaneOpen(session.id !== active?.id || !showAgentPane);
      setSelectedAgent(session.id);
      setExpanded(false);
    } else {
      terminalViewRevision.current += 1;
      setTerminalOpen(session.id !== activeTerminal?.id || !visibleTerminal);
      setSelectedTerminal(session.id);
    }
    if (narrow) setContextOpen(false);
  }
  function toggleTerminal() {
    terminalViewRevision.current += 1;
    setTerminalOpen(!visibleTerminal);
  }
  async function addAgent(agentId: AgentId) {
    const store = useTaskSessionStore.getState();
    if (store.pending) return;
    const revision = ++agentViewRevision.current;
    const previousIds = new Set(store.sessions.map((session) => session.id));
    await store.start({ taskId: task.id, kind: "agent", agentId });
    const created = useTaskSessionStore.getState().sessions.find((session) => session.taskId === task.id && session.kind === "agent" && !previousIds.has(session.id));
    // 创建期间用户可能已经关闭面板或选择其他会话，不覆盖较新的视图操作。
    if (created && revision === agentViewRevision.current) { setSelectedAgent(created.id); setAgentPaneOpen(true); setExpanded(false); if (narrow) setContextOpen(false); }
  }
  const newSessionControl = <NewSessionMenu choices={agentChoices} disabled={pending} onCreate={(id) => void addAgent(id)} />;
  function showReview(resource: TaskResource) {
    const date = new Date().toISOString();
    setReview({ id: "task-review-" + task.id + "-" + resource.resourceId, agent: "Claude Code", title: task.title,
      projectPath: resource.workingPath, projectName: resource.name, branchName: resource.targetBranch,
      startedAt: date, endedAt: date, updatedAt: date, fileCount: 0, additions: 0, deletions: 0, unread: false });
    if (narrow) setContextOpen(false);
  }
  function runResource(operation: () => Promise<void>) {
    void operation().catch(() => setPreview({ title: t("tasks:runtime.resourceError"), body: t("tasks:runtime.resourceErrorDetail") }));
  }
  return <div ref={rootRef} className="task-workbench" data-narrow={narrow} data-context-open={contextOpen}>
    <header className="task-workbench-heading">
      <IconTooltip label={t("tasks:runtime.context")} aria-expanded={contextOpen} size="icon-sm" onClick={() => setContextOpen(!contextOpen)}><PanelLeft /></IconTooltip>
      <div className="task-workbench-title">
        <h2 id={headingId} title={task.title}>{task.title}</h2>
        <span className="task-workbench-task-status">{task.status}</span>
      </div>
      <div className="task-workbench-actions">
        <IconTooltip className="relative" label={t("tasks:runtime.showTerminal")} size="icon-sm" disabled={pending} onClick={() => { if (!terminals.length) void addTerminal(); else toggleTerminal(); }}>
          <Terminal />{terminals.length > 0 && <span className="task-terminal-badge" aria-hidden="true">{terminals.length}</span>}
        </IconTooltip>
        {onOpenPage && <IconTooltip label={t("tasks:actions.openPage")} size="icon-sm" onClick={onOpenPage}><SquareArrowOutUpRight /></IconTooltip>}
        {onOpenPage && <Button variant="ghost" size="icon-sm" aria-label={t("tasks:details.close")} onClick={onClose}><X /></Button>}
      </div>
    </header>
    {error && <div role="alert" className="task-workbench-error">{t("tasks:runtime.operationFailed")}<Button variant="ghost" size="sm" onClick={() => useTaskSessionStore.setState({ error: null })}>{t("common:actions.close")}</Button></div>}
    <div className="task-workbench-layout">
      {contextOpen && <>
        {narrow && <button className="task-context-backdrop" aria-label={t("tasks:runtime.hideContext")} onClick={() => setContextOpen(false)} />}
        <div className="task-context-container" style={{ width: railWidth }}>
          <TaskResourceRail task={task} sessions={sessions} activeId={showAgentPane ? active?.id : undefined} activeTerminalId={visibleTerminal ? activeTerminal?.id : undefined}
            archivePending={pending} onArchive={(id) => void useTaskSessionStore.getState().archive(id)}
            onSelect={selectContextSession}
            newSessionControl={newSessionControl} onAddTerminal={() => void addTerminal()} onReview={showReview}
            onPreview={(title, body) => setPreview({ title, body })}
            onAttachment={(id) => runResource(() => getTaskSessionsApi().revealAttachment(task.id, id))}
            onLink={(id) => runResource(() => getTaskSessionsApi().openLink(task.id, id))} />
        </div>
        {!narrow && <WorkspaceSeparator label={t("tasks:runtime.resizeContext")} value={railWidth} min={160} max={300} onDelta={(delta) => setRailWidth((width) => Math.max(160, Math.min(300, (rootRef.current?.clientWidth ?? 620) - 320, width + delta)))} />}
      </>}
      <div className="task-workbench-content" ref={contentRef}>
        {showAgentPane && <div className="task-agent-container"><AgentSessionPane task={task} session={active} newSessionControl={newSessionControl}
          emptySessionControl={<NewSessionMenu choices={agentChoices} disabled={pending} onCreate={(id) => void addAgent(id)} withLabel />}
          onClosePane={() => { agentViewRevision.current += 1; setAgentPaneOpen(false); }} /></div>}
        {visibleTerminal && <>
          {showAgentPane && <WorkspaceSeparator label={t("tasks:runtime.resizeTerminal")} value={terminalHeight} min={100} max={400} vertical onDelta={(delta) => setTerminalHeight((height) => Math.max(100, Math.min(400, (contentRef.current?.clientHeight ?? 600) - 160, height - delta)))} />}
          <div className="task-shell-container" data-expanded={terminalFillsSpace} style={terminalFillsSpace ? undefined : { height: terminalHeight }}>
            <TaskTerminalDrawer sessions={terminals} activeId={activeTerminal?.id} expanded={expanded} onSelect={(id) => { terminalViewRevision.current += 1; setSelectedTerminal(id); }}
              onAdd={() => void addTerminal()} onExpand={() => setExpanded(!expanded)} onCollapse={toggleTerminal} />
          </div>
        </>}
      </div>
    </div>
    <Dialog open={preview !== null} onOpenChange={(open) => { if (!open) setPreview(null); }}><DialogContent aria-describedby={undefined} className="sm:max-w-lg">
      <DialogTitle>{preview?.title}</DialogTitle><p className="whitespace-pre-wrap break-words text-sm leading-6">{preview?.body}</p>
    </DialogContent></Dialog>
    <ReviewDialog session={review} open={review !== null} onOpenChange={(open) => { if (!open) setReview(null); }} settings={settings} resolvedTheme={resolvedTheme} onSettingsChange={updateSettings} />
  </div>;
}
