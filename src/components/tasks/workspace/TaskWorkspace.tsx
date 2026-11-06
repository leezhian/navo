import { useExtensions } from "@/hooks/useExtensions";
import { useEffect, useRef, useState } from "react";
import { useVisibleSessionResume } from "@/hooks/useVisibleSessionResume";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, SquareArrowOutUpRight, Terminal, X } from "lucide-react";
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
import { ButtonGroup } from "@/components/ui/button-group";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ReviewDialog } from "@/components/review/ReviewDialog";
import { useLocalSettings } from "@/hooks/useLocalSettings";
import { TaskResourceRail } from "./TaskResourceRail";
import { TaskContextPanel } from "./TaskContextPanel";
import { TaskPanelSheet } from "./TaskPanelSheet";
import { AgentSessionPane } from "./AgentSessionPane";
import { TaskTerminalDrawer } from "./TaskTerminalDrawer";
import { NewSessionMenu } from "./NewSessionMenu";
import { NewTerminalMenu } from "./NewTerminalMenu";
import { useSessionAgentChoices } from "@/hooks/useSessionAgentChoices";
import { useTaskSessionCreation } from "@/hooks/useTaskSessionCreation";
import type { AgentId } from "@/shared/agentTypes";
import { WorkspaceSeparator } from "./WorkspaceSeparator";
import { TaskBranchPane } from "./TaskBranchPane";
import { TaskNotePane } from "./TaskNotePane";
import { TaskNoteDialogs } from "./TaskNoteDialogs";
import { useTaskNoteEditor } from "@/hooks/useTaskNoteEditor";
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
  const { startSession, invalidateSelection } = useTaskSessionCreation(task.id);
  const agentChoices = useSessionAgentChoices();
  const [selectedTerminal, setSelectedTerminal] = useState<string>();
  const active = agents.find((session) => session.id === selectedAgent) ?? agents[agents.length - 1];
  const activeTerminal = terminals.find((session) => session.id === selectedTerminal) ?? terminals[0];
  const [contextOpen, setContextOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [railWidth, setRailWidth] = useState(216);
  const [terminalHeight, setTerminalHeight] = useState(192);
  const [narrow, setNarrow] = useState(false);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const [rightOpen, setRightOpen] = useState<boolean>();
  const [rightWidth, setRightWidth] = useState(326);
  const [rightContent, setRightContent] = useState<{ kind: "branch" } | { kind: "note"; id: string }>({ kind: "branch" });
  const [selectedResource, setSelectedResource] = useState<string>();
  const repositories = task.resources?.filter((resource) => resource.mode !== "folder") ?? [];
  const branchResource = repositories.find((resource) => resource.resourceId === selectedResource) ?? repositories[0];
  const noteEditor = useTaskNoteEditor(task, rightContent.kind === "note" ? rightContent.id : undefined, () => setRightOpen(false));
  const [preview, setPreview] = useState<{ title: string; body: string } | null>(null);
  const [review, setReview] = useState<{ session: ReviewSession; mode: CompareMode; targetBranch: string; filePath?: string } | null>(null);
  const [addCategory, setAddCategory] = useState<TaskResourceCategory | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contextTriggerRef = useRef<HTMLButtonElement>(null);
  const branchTriggerRef = useRef<HTMLButtonElement>(null);
  const noteTriggerRef = useRef<HTMLButtonElement>(null);
  const [layoutContainer, setLayoutContainer] = useState<HTMLDivElement | null>(null);
  const visibleTerminal = terminalOpen && terminals.length > 0;
  const showAgentPane = agentPaneOpen && (!expanded || !visibleTerminal);
  const contentWidth = workspaceWidth - (contextOpen && !narrow ? railWidth + 8 : 0);
  const rightOverlay = contentWidth < 640 && (agentPaneOpen || rightContent.kind === "note");
  const visibleRight = Boolean((rightContent.kind === "branch" ? branchResource : noteEditor.note) && (rightOpen ?? contentWidth >= 640) && (!expanded || !visibleTerminal));
  const visibleBranch = visibleRight && rightContent.kind === "branch";
  const visibleNote = visibleRight && rightContent.kind === "note";
  const showUpper = showAgentPane || (visibleRight && !rightOverlay);
  const terminalFillsSpace = !showUpper;
  const extension = useExtensions();
  const traceAvailable = Boolean(extension.status?.enabled && extension.status.compatible && ["claude", "codex"].includes(active?.agent?.agentId ?? ""));
  const [sessionView, setSessionView] = useState<{ id?: string; trace: boolean; suppressResume: boolean }>({ trace: false, suppressResume: false });
  const traceSelected = sessionView.id === active?.id && sessionView.trace && traceAvailable;
  const resumeSuppressed = sessionView.id === active?.id && (sessionView.trace || sessionView.suppressResume);
  useEffect(() => {
    if (!traceAvailable) setSessionView(current => current.trace ? { ...current, trace: false, suppressResume: true } : current);
  }, [traceAvailable]);
  const agentPaneVisible = showAgentPane && !(narrow && contextOpen) && !(visibleRight && rightOverlay);
  useVisibleSessionResume(task, active, agentPaneVisible && !resumeSuppressed, rootRef);

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

  async function addTerminal(resourceId?: string, commandId?: string) {
    const created = await startSession({ kind: "shell", resourceId, commandId });
    if (created) { setSelectedTerminal(created.id); setTerminalOpen(true); }
  }
  function selectContextSession(session: TaskSession, forceOpen = false) {
    if (session.kind === "agent") {
      invalidateSelection("agent");
      setAgentPaneOpen(forceOpen || session.id !== active?.id || !showAgentPane);
      setSelectedAgent(session.id);
      setExpanded(false);
    } else {
      invalidateSelection("shell");
      setTerminalOpen(session.id !== activeTerminal?.id || !visibleTerminal);
      setSelectedTerminal(session.id);
    }
    if (narrow) setContextOpen(false);
  }
  function toggleTerminal() {
    invalidateSelection("shell");
    setTerminalOpen(!visibleTerminal);
  }
  async function addAgent(agentId: AgentId, resourceId?: string | null, sourceSessionId?: string) {
    const created = await startSession({ kind: "agent", agentId, resourceId, sourceSessionId });
    if (created) { setSelectedAgent(created.id); setAgentPaneOpen(true); setExpanded(false); if (narrow) setContextOpen(false); }
  }
  const newSessionControl = <NewSessionMenu choices={agentChoices} resources={task.resources} disabled={pending} onCreate={(id, resourceId) => void addAgent(id, resourceId)} />;
  const terminalMenuProps = { resources: task.resources, disabled: pending, onCreate: (resourceId?: string) => void addTerminal(resourceId) };
  const newTerminalControl = <NewTerminalMenu {...terminalMenuProps} />;
  const multipleTerminalDirectories = (task.resources?.length ?? 0) > 1;
  const terminalButton = <IconTooltip className="relative" label={t("tasks:runtime.showTerminal")} size="icon-sm" disabled={pending} onClick={() => { if (!terminals.length && !multipleTerminalDirectories) void addTerminal(task.resources?.[0]?.resourceId); else if (terminals.length) toggleTerminal(); }}>
    <Terminal />{terminals.length > 0 && <span className="task-terminal-badge" aria-hidden="true">{terminals.length}</span>}
  </IconTooltip>;
  function showBranch(resource: TaskResource) {
    noteEditor.leave(() => {
      setSelectedResource(resource.resourceId); setRightContent({ kind: "branch" }); setRightOpen(true); setExpanded(false);
      if (narrow) setContextOpen(false);
    });
  }
  function showNote(id: string, trigger: HTMLButtonElement) {
    const open = () => {
      noteTriggerRef.current = trigger;
      setRightContent({ kind: "note", id }); setRightOpen(true); setExpanded(false);
      if (narrow) setContextOpen(false);
    };
    if (rightContent.kind === "note" && rightContent.id === id) open();
    else noteEditor.leave(open);
  }
  function closeRight() { noteEditor.leave(() => setRightOpen(false)); }
  function toggleContext() {
    const toggle = () => { setContextOpen(!contextOpen); if (narrow) setRightOpen(false); };
    if (narrow) noteEditor.leave(toggle); else toggle();
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
  const rightPane = rightContent.kind === "note" ? <TaskNotePane editor={noteEditor} onClose={closeRight} /> : branchResource ? <TaskBranchPane key={branchResource.resourceId + branchResource.workingPath} taskId={task.id} resource={branchResource} onClose={closeRight} onOpenDiff={showReview} /> : null;
  const rightTitle = t(rightContent.kind === "note" ? "tasks:notes.title" : "tasks:branch.title");
  const rightCloseLabel = t(rightContent.kind === "note" ? "tasks:notes.close" : "tasks:branch.close");
  return <div ref={rootRef} className="task-workbench" data-narrow={narrow} data-context-open={contextOpen}>
    <header className="task-workbench-heading">
      <IconTooltip ref={contextTriggerRef} label={t("tasks:runtime.context")} aria-expanded={contextOpen} size="icon-sm" onClick={toggleContext}>{contextOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</IconTooltip>
      <div className="task-workbench-title">
        <h2 id={headingId} title={task.title}>{task.title}</h2>
        <span className="task-workbench-task-status">{task.status}</span>
      </div>
      <div className="task-workbench-actions">
        <ButtonGroup>
          {multipleTerminalDirectories && !terminals.length ? <NewTerminalMenu {...terminalMenuProps} trigger={terminalButton} /> : terminalButton}
          {multipleTerminalDirectories && <NewTerminalMenu {...terminalMenuProps} trigger={<IconTooltip label={t("tasks:runtime.chooseTerminalDirectory")} size="icon-sm" className="w-4" disabled={pending}><ChevronDown /></IconTooltip>} />}
        </ButtonGroup>
        {branchResource && <IconTooltip ref={branchTriggerRef} label={t(visibleBranch ? "tasks:branch.hide" : "tasks:branch.show")} aria-expanded={visibleBranch} size="icon-sm" onClick={() => { if (visibleBranch) closeRight(); else showBranch(branchResource); }}>{visibleBranch ? <PanelRightClose /> : <PanelRightOpen />}</IconTooltip>}
        {onOpenPage && <IconTooltip label={t("tasks:actions.openPage")} size="icon-sm" onClick={() => noteEditor.leave(onOpenPage)}><SquareArrowOutUpRight /></IconTooltip>}
        {onOpenPage && <Button variant="ghost" size="icon-sm" aria-label={t("tasks:details.close")} onClick={() => noteEditor.leave(onClose)}><X /></Button>}
      </div>
    </header>
    {error && <div role="alert" className="task-workbench-error">{t(error === "SESSION_INITIALIZATION_REQUIRED" ? "tasks:context.setupBlocked" : "tasks:runtime.operationFailed")}<Button variant="ghost" size="sm" onClick={() => useTaskSessionStore.setState({ error: null })}>{t("common:actions.close")}</Button></div>}
    <div className="task-workbench-layout" ref={setLayoutContainer}>
        <TaskContextPanel narrow={narrow} open={contextOpen} onOpenChange={setContextOpen} width={railWidth} container={layoutContainer} triggerRef={contextTriggerRef}>
          <TaskResourceRail task={task} sessions={allSessions.filter((session) => session.taskId === task.id)} activeId={showAgentPane ? active?.id : undefined} activeTerminalId={visibleTerminal ? activeTerminal?.id : undefined}
            activeResourceId={visibleBranch ? branchResource?.resourceId : undefined} activeNoteId={visibleNote ? noteEditor.note?.id : undefined} onNote={showNote}
            onDeleteNote={(id) => noteEditor.requestDelete(id)} noteDeleteDisabled={noteEditor.pending || noteEditor.busy || noteEditor.readOnly}
            onRunCommand={(resourceId, commandId) => void addTerminal(resourceId, commandId)}
            agentChoices={agentChoices} onNewSession={(id, resourceId) => void addAgent(id, resourceId)} onNewTerminal={(resourceId) => void addTerminal(resourceId)}
            onNewSessionFrom={(id, sourceSessionId) => void addAgent(id, undefined, sourceSessionId)}
            archivePending={pending} onArchive={(id) => void useTaskSessionStore.getState().archive(id)}
            onSelect={selectContextSession}
            newSessionControl={newSessionControl} newTerminalControl={newTerminalControl} onReview={showBranch}
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
          traceAvailable={traceAvailable} traceSelected={traceSelected} visible={agentPaneVisible} onViewChange={trace => setSessionView({ id: active?.id, trace, suppressResume: false })}
          emptySessionControl={<NewSessionMenu choices={agentChoices} resources={task.resources} disabled={pending} onCreate={(id, resourceId) => void addAgent(id, resourceId)} withLabel />}
          onClosePane={() => { invalidateSelection("agent"); setAgentPaneOpen(false); }} /></div>}
        {visibleRight && !rightOverlay && <>
          {showAgentPane && <WorkspaceSeparator label={t(rightContent.kind === "note" ? "tasks:notes.resize" : "tasks:branch.resize")} value={rightWidth} min={268} max={540} onDelta={(delta) => setRightWidth((width) => Math.max(268, Math.min(540, contentWidth - 288, width - delta)))} />}
          <div className="task-branch-container" style={showAgentPane ? { width: Math.min(rightWidth, contentWidth - 288) } : { flex: 1 }}>{rightPane}</div>
        </>}
        </div>}
        {visibleTerminal && <>
          {showUpper && <WorkspaceSeparator label={t("tasks:runtime.resizeTerminal")} value={terminalHeight} min={100} max={400} vertical onDelta={(delta) => setTerminalHeight((height) => Math.max(100, Math.min(400, (contentRef.current?.clientHeight ?? 600) - 160, height - delta)))} />}
          <div className="task-shell-container" data-expanded={terminalFillsSpace} style={terminalFillsSpace ? undefined : { height: terminalHeight }}>
            <TaskTerminalDrawer sessions={terminals} activeId={activeTerminal?.id} expanded={expanded} onSelect={(id) => { invalidateSelection("shell"); setSelectedTerminal(id); }}
              newTerminalControl={newTerminalControl} onExpand={() => setExpanded(!expanded)} onCollapse={toggleTerminal} />
          </div>
        </>}
      </div>
      {rightOverlay && <TaskPanelSheet side="right" open={visibleRight} onOpenChange={(open) => { if (!open) closeRight(); }} width={360} container={layoutContainer} triggerRef={rightContent.kind === "note" ? noteTriggerRef : branchTriggerRef}
        fallbackTriggerRef={contextTriggerRef}
        className="task-branch-overlay" title={rightTitle} closeLabel={rightCloseLabel}>
        {rightPane}
      </TaskPanelSheet>}
    </div>
    <Dialog open={preview !== null} onOpenChange={(open) => { if (!open) setPreview(null); }}><DialogContent aria-describedby={undefined} className="sm:max-w-lg">
      <DialogTitle>{preview?.title}</DialogTitle><p className="whitespace-pre-wrap break-words text-sm leading-6">{preview?.body}</p>
    </DialogContent></Dialog>
    <ReviewDialog session={review?.session ?? null} open={review !== null} initialCompareMode={review?.mode} initialTargetBranch={review?.targetBranch} initialFilePath={review?.filePath} onOpenChange={(open) => { if (!open) setReview(null); }} settings={settings} resolvedTheme={resolvedTheme} onSettingsChange={updateSettings} />
    <TaskNoteDialogs editor={noteEditor} />
    {addCategory && <TaskAddResourcesDialog task={task} initialCategory={addCategory} onClose={() => setAddCategory(null)} />}
  </div>;
}
