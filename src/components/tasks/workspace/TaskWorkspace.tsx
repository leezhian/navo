import { useEffect, useRef, useState } from "react";
import { PanelLeft, PanelRightOpen, SquareArrowOutUpRight, Terminal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import type { TaskResource } from "@/shared/taskTypes";
import type { TaskSession } from "@/shared/taskSessionTypes";
import type { CompareMode, ReviewSession } from "@/domain/types";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { getTaskSessionsApi } from "@/services/taskSessionApi";
import { getTasksApi } from "@/services/taskApi";
import type { TaskResourceCategory } from "@/shared/taskResourceTypes";
import { TaskAddResourcesDialog } from "../resources/TaskAddResourcesDialog";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ReviewDialog } from "@/components/review/ReviewDialog";
import { useLocalSettings } from "@/hooks/useLocalSettings";
import { TaskResourceRail } from "./TaskResourceRail";
import { TaskContextPanel } from "./TaskContextPanel";
import { AgentSessionPane } from "./AgentSessionPane";
import { TaskTerminalDrawer } from "./TaskTerminalDrawer";
import { NewSessionMenu } from "./NewSessionMenu";
import { useSessionAgentChoices } from "@/hooks/useSessionAgentChoices";
import type { AgentId } from "@/shared/agentTypes";
import { WorkspaceSeparator } from "./WorkspaceSeparator";
import { TaskBranchPane } from "./TaskBranchPane";
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
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const [branchOpen, setBranchOpen] = useState<boolean>();
  const [branchWidth, setBranchWidth] = useState(326);
  const [selectedResource, setSelectedResource] = useState<string>();
  const repositories = task.resources?.filter((resource) => resource.mode !== "folder") ?? [];
  const branchResource = repositories.find((resource) => resource.resourceId === selectedResource) ?? repositories[0];
  const [preview, setPreview] = useState<{ title: string; body: string } | null>(null);
  const [review, setReview] = useState<{ session: ReviewSession; mode: CompareMode; targetBranch: string; filePath?: string } | null>(null);
  const [addCategory, setAddCategory] = useState<TaskResourceCategory | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contextTriggerRef = useRef<HTMLButtonElement>(null);
  const [layoutContainer, setLayoutContainer] = useState<HTMLDivElement | null>(null);
  const visibleTerminal = terminalOpen && terminals.length > 0;
  const showAgentPane = agentPaneOpen && (!expanded || !visibleTerminal);
  const contentWidth = workspaceWidth - (contextOpen && !narrow ? railWidth + 8 : 0);
  const branchOverlay = contentWidth < 640 && agentPaneOpen;
  const visibleBranch = Boolean(branchResource && (branchOpen ?? contentWidth >= 640) && (!expanded || !visibleTerminal));
  const showUpper = showAgentPane || (visibleBranch && !branchOverlay);
  const terminalFillsSpace = !showUpper;

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    let previousNarrow = false;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth <= 0) return;
      const nextNarrow = element.clientWidth < 620;
      setNarrow(nextNarrow);
      setWorkspaceWidth(element.clientWidth);
      if (previousNarrow !== nextNarrow) {
        setContextOpen(!nextNarrow);
        previousNarrow = nextNarrow;
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
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
  async function addAgent(agentId: AgentId, resourceId?: string | null) {
    const store = useTaskSessionStore.getState();
    if (store.pending) return;
    const revision = ++agentViewRevision.current;
    const previousIds = new Set(store.sessions.map((session) => session.id));
    await store.start({ taskId: task.id, kind: "agent", agentId, resourceId });
    const created = useTaskSessionStore.getState().sessions.find((session) => session.taskId === task.id && session.kind === "agent" && !previousIds.has(session.id));
    // 创建期间用户可能已经关闭面板或选择其他会话，不覆盖较新的视图操作。
    if (created && revision === agentViewRevision.current) { setSelectedAgent(created.id); setAgentPaneOpen(true); setExpanded(false); if (narrow) setContextOpen(false); }
  }
  const newSessionControl = <NewSessionMenu choices={agentChoices} resources={task.resources} disabled={pending} onCreate={(id, resourceId) => void addAgent(id, resourceId)} />;
  function showBranch(resource: TaskResource) {
    setSelectedResource(resource.resourceId); setBranchOpen(true); setExpanded(false);
    if (narrow) setContextOpen(false);
  }
  function showReview(mode: CompareMode, filePath?: string, branchName?: string) {
    const resource = branchResource;
    if (!resource) return;
    const date = new Date().toISOString();
    setReview({ session: { id: "task-review-" + task.id + "-" + resource.resourceId, agent: "Claude Code", title: task.title,
      projectPath: resource.workingPath, projectName: resource.name, branchName: branchName || resource.targetBranch || resource.sourceBranch,
      startedAt: date, endedAt: date, updatedAt: date, fileCount: 0, additions: 0, deletions: 0, unread: false }, mode, targetBranch: resource.sourceBranch || settings.targetBranch, filePath });
    if (narrow) setContextOpen(false);
  }
  function runResource(operation: () => Promise<void>) {
    void operation().catch(() => setPreview({ title: t("tasks:runtime.resourceError"), body: t("tasks:runtime.resourceErrorDetail") }));
  }
  const branchPane = branchResource && visibleBranch ? <TaskBranchPane key={branchResource.resourceId + branchResource.workingPath} taskId={task.id} resource={branchResource} onClose={() => setBranchOpen(false)} onOpenDiff={showReview} /> : null;
  return <div ref={rootRef} className="task-workbench" data-narrow={narrow} data-context-open={contextOpen}>
    <header className="task-workbench-heading">
      <IconTooltip ref={contextTriggerRef} label={t("tasks:runtime.context")} aria-expanded={contextOpen} size="icon-sm" onClick={() => { setContextOpen(!contextOpen); if (narrow) setBranchOpen(false); }}><PanelLeft /></IconTooltip>
      <div className="task-workbench-title">
        <h2 id={headingId} title={task.title}>{task.title}</h2>
        <span className="task-workbench-task-status">{task.status}</span>
      </div>
      <div className="task-workbench-actions">
        {branchResource && <IconTooltip label={t("tasks:branch.show")} aria-expanded={visibleBranch} size="icon-sm" onClick={() => { setBranchOpen(!visibleBranch); setExpanded(false); if (narrow) setContextOpen(false); }}><PanelRightOpen /></IconTooltip>}
        <IconTooltip className="relative" label={t("tasks:runtime.showTerminal")} size="icon-sm" disabled={pending} onClick={() => { if (!terminals.length) void addTerminal(); else toggleTerminal(); }}>
          <Terminal />{terminals.length > 0 && <span className="task-terminal-badge" aria-hidden="true">{terminals.length}</span>}
        </IconTooltip>
        {onOpenPage && <IconTooltip label={t("tasks:actions.openPage")} size="icon-sm" onClick={onOpenPage}><SquareArrowOutUpRight /></IconTooltip>}
        {onOpenPage && <Button variant="ghost" size="icon-sm" aria-label={t("tasks:details.close")} onClick={onClose}><X /></Button>}
      </div>
    </header>
    {error && <div role="alert" className="task-workbench-error">{t("tasks:runtime.operationFailed")}<Button variant="ghost" size="sm" onClick={() => useTaskSessionStore.setState({ error: null })}>{t("common:actions.close")}</Button></div>}
    <div className="task-workbench-layout" ref={setLayoutContainer}>
        <TaskContextPanel narrow={narrow} open={contextOpen} onOpenChange={setContextOpen} width={railWidth} container={layoutContainer} triggerRef={contextTriggerRef}>
          <TaskResourceRail task={task} sessions={sessions} activeId={showAgentPane ? active?.id : undefined} activeTerminalId={visibleTerminal ? activeTerminal?.id : undefined}
            archivePending={pending} onArchive={(id) => void useTaskSessionStore.getState().archive(id)}
            onSelect={selectContextSession}
            newSessionControl={newSessionControl} onAddTerminal={() => void addTerminal()} onReview={showBranch}
            onAddResource={setAddCategory} onFile={(id) => runResource(() => getTasksApi().revealResourceFile(task.id, id))}
            onWorkspaceOpenError={() => setPreview({ title: t("tasks:workspaceOpen.failed"), body: t("tasks:workspaceOpen.failedDetail") })}
            onPreview={(title, body) => setPreview({ title, body })}
            onAttachment={(id) => runResource(() => getTaskSessionsApi().revealAttachment(task.id, id))}
            onLink={(id) => runResource(() => getTaskSessionsApi().openLink(task.id, id))} />
        </TaskContextPanel>
        {contextOpen && !narrow && <WorkspaceSeparator label={t("tasks:runtime.resizeContext")} value={railWidth} min={160} max={300} onDelta={(delta) => setRailWidth((width) => Math.max(160, Math.min(300, (rootRef.current?.clientWidth ?? 620) - 320, width + delta)))} />}
      <div className="task-workbench-content" ref={contentRef}>
        {showUpper && <div className="task-workbench-upper">
        {showAgentPane && <div className="task-agent-container"><AgentSessionPane task={task} session={active} newSessionControl={newSessionControl}
          emptySessionControl={<NewSessionMenu choices={agentChoices} resources={task.resources} disabled={pending} onCreate={(id, resourceId) => void addAgent(id, resourceId)} withLabel />}
          onClosePane={() => { agentViewRevision.current += 1; setAgentPaneOpen(false); }} /></div>}
        {visibleBranch && !branchOverlay && <>
          {showAgentPane && <WorkspaceSeparator label={t("tasks:branch.resize")} value={branchWidth} min={268} max={540} onDelta={(delta) => setBranchWidth((width) => Math.max(268, Math.min(540, contentWidth - 288, width - delta)))} />}
          <div className="task-branch-container" style={showAgentPane ? { width: Math.min(branchWidth, contentWidth - 288) } : { flex: 1 }}>{branchPane}</div>
        </>}
        </div>}
        {visibleTerminal && <>
          {showUpper && <WorkspaceSeparator label={t("tasks:runtime.resizeTerminal")} value={terminalHeight} min={100} max={400} vertical onDelta={(delta) => setTerminalHeight((height) => Math.max(100, Math.min(400, (contentRef.current?.clientHeight ?? 600) - 160, height - delta)))} />}
          <div className="task-shell-container" data-expanded={terminalFillsSpace} style={terminalFillsSpace ? undefined : { height: terminalHeight }}>
            <TaskTerminalDrawer sessions={terminals} activeId={activeTerminal?.id} expanded={expanded} onSelect={(id) => { terminalViewRevision.current += 1; setSelectedTerminal(id); }}
              onAdd={() => void addTerminal()} onExpand={() => setExpanded(!expanded)} onCollapse={toggleTerminal} />
          </div>
        </>}
      </div>
      {visibleBranch && branchOverlay && <><button className="task-context-backdrop" aria-label={t("tasks:branch.close")} onClick={() => setBranchOpen(false)} /><div className="task-branch-overlay">{branchPane}</div></>}
    </div>
    <Dialog open={preview !== null} onOpenChange={(open) => { if (!open) setPreview(null); }}><DialogContent aria-describedby={undefined} className="sm:max-w-lg">
      <DialogTitle>{preview?.title}</DialogTitle><p className="whitespace-pre-wrap break-words text-sm leading-6">{preview?.body}</p>
    </DialogContent></Dialog>
    <ReviewDialog session={review?.session ?? null} open={review !== null} initialCompareMode={review?.mode} initialTargetBranch={review?.targetBranch} initialFilePath={review?.filePath} onOpenChange={(open) => { if (!open) setReview(null); }} settings={settings} resolvedTheme={resolvedTheme} onSettingsChange={updateSettings} />
    {addCategory && <TaskAddResourcesDialog task={task} initialCategory={addCategory} onClose={() => setAddCategory(null)} />}
  </div>;
}
