import { useReadingPosition } from "@/hooks/useReadingPosition";
import { readingPositionKey } from "@/stores/readingPositionStore";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { useState } from "react";
import type { ReactNode } from "react";
import { Archive, ChevronDown, ChevronRight, CircleDot, FileText, FolderGit2, GitBranch, GitPullRequest, Link2, Plus, RefreshCw, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import type { TaskResource } from "@/shared/taskTypes";
import type { TaskSession } from "@/shared/taskSessionTypes";
import type { AgentId } from "@/shared/agentTypes";
import type { TaskResourceCategory } from "@/shared/taskResourceTypes";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Button } from "@/components/ui/button";
import { AgentProviderIcon } from "./AgentProviderIcon";
import { sessionWorkspaceLabel } from "@/utils/taskSessionWorkspace";
import { WorkspaceOpenActions } from "./WorkspaceOpenActions";
import { WorkspaceCommandActions } from "./WorkspaceCommandActions";
import { TaskNoteRow } from "./TaskNoteRow";
import { TASK_PROMPT_ID } from "@/shared/taskContextTypes";
import { TaskResourceMenu } from "./TaskResourceMenu";
import { TaskIssueMenu } from "./TaskIssueMenu";
import type { IssueItem } from "@/domain/issues";
import { TaskChangeMenu } from "./TaskChangeMenu";
import { TaskSessionMenu } from "./TaskSessionMenu";
import { ArchivedSessions } from "./ArchivedSessions";
import { TaskInitializationPanel } from "./TaskInitializationPanel";
import { SessionHoverDetails } from "./SessionHoverDetails";
import { ChangeHoverDetails } from "./ChangeHoverDetails";
import { useSessionUnread } from "@/hooks/useSessionUnread";
import { useTaskIssueGroupRefresh } from "@/hooks/useTaskIssueGroupRefresh";
import { sessionActivityText } from "@/utils/sessionActivityLabel";
import { aggregateTaskWebLinks } from "@/utils/taskWebLinks";
import { useTaskStore } from "@/stores/taskStore";
import { useTaskResourceUndoStore } from "@/stores/taskResourceUndoStore";
import { TaskWebLinkMenu } from "./TaskWebLinkMenu";
import type { TaskResourceRef } from "@/shared/taskResourceLifecycle";

interface TaskResourceRailProps {
  /** 只展示真实关联资源，不填充 demo 条目。 */
  task: Task;
  sessions: TaskSession[];
  activeId?: string;
  /** 仅在终端面板可见时提供，收起后不高亮条目。 */
  activeTerminalId?: string;
  /** 仅高亮右侧当前可见的仓库或笔记；两者互斥。 */
  activeResourceId?: string;
  activeNoteId?: string;
  /** 打开右侧笔记面板，保留触发按钮以恢复抽屉焦点。 */
  onNote: (id: string, trigger: HTMLButtonElement) => void;
  /** 右击删除只打开确认，不切换当前笔记。 */
  onDeleteNote: (id: string) => void;
  /** 右键或 F2 打开目标笔记并进入独立标题编辑。 */
  onRenameNote?: (id: string, trigger: HTMLButtonElement) => void;
  noteDeleteDisabled: boolean;
  /** 在所选工作区的独立终端运行仓库命令。 */
  onRunCommand: (resourceId: string, commandId: string) => void;
  /** CHANGES 右键菜单直接绑定所选目录，与会话加号共用 Agent 列表。 */
  agentChoices?: Array<{ id: AgentId; ready: boolean }>;
  onNewSession?: (agentId: AgentId, resourceId: string) => void;
  /** 沿用所选会话目录创建全新对话，不复制原生历史。 */
  onNewSessionFrom?: (agentId: AgentId, sourceSessionId: string) => void;
  /** 在所选目录创建任务内终端。 */
  onNewTerminal?: (resourceId: string) => void;
  /** 左键同项切换显隐；右键 Open 传 forceOpen，始终展示所选会话。 */
  onSelect: (session: TaskSession, forceOpen?: boolean) => void;
  /** 归档恢复后回到活动列表，并解除只读查看留下的自动恢复抑制。 */
  onRestored: (session: TaskSession) => void;
  /** 与会话面板共用工作目录及 Agent 新建菜单。 */
  newSessionControl: ReactNode;
  /** 归档为独立操作，不触发选择；归档会终止进程并保留历史记录。 */
  onArchive: (id: string) => void;
  archivePending: boolean;
  /** 与终端面板共用的新建入口，多目录时先选择工作目录。 */
  newTerminalControl: ReactNode;
  onReview: (resource: TaskResource) => void;
  onPreview: (title: string, body: string) => void;
  /** 打开 PR/Issue 平台详情；refresh 为 true 时强制单项刷新。 */
  onIssuePreview?: (item: IssueItem, refresh?: boolean) => void;
  onAttachment: (id: string) => void;
  onLink: (id: string) => void;
  /** 正式页打开统一资源窗口；独立 demo 可省略以保持只读。 */
  onAddResource?: (category: TaskResourceCategory, showList?: boolean) => void;
  /** 打开原路径文件的应用内预览；不支持的类型由工作台回退到访达。 */
  onFile?: (id: string) => void;
  /** 右侧文件预览打开时高亮对应 LINKS 条目。 */
  activeFile?: { kind: "file" | "attachment"; id: string };
  /** 打开外部应用失败时由工作台展示错误；demo 不传时禁用外部操作。 */
  onWorkspaceOpenError?: () => void;
}
interface ResourceGroupProps {
  /** 各分组独立展开收起，不影响当前内容和进程。 */
  title: string;
  count: number;
  children: ReactNode;
  action?: ReactNode;
  /** 省略时只展示禁用加号。 */
  onAdd?: () => void;
  /** PR/Issue 分组刷新独立于展开和添加，失败在本组显示。 */
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshDisabled?: boolean;
  refreshFailed?: number;
}
interface ContextItemIconProps {
  /** 仅承载条目前置图标，分类及操作按钮不使用背景容器。 */
  children: ReactNode;
}
function ContextItemIcon({ children }: ContextItemIconProps) {
  return <span className="task-context-item-icon">{children}</span>;
}
function ResourceGroup({ title, count, children, action, onAdd, onRefresh, refreshing, refreshDisabled, refreshFailed = 0 }: ResourceGroupProps) {
  const { t } = useTranslation(["tasks", "common", "issues"]);
  const [open, setOpen] = useState(true);
  if (count === 0) return null;
  return <section className="task-context-group">
    <div className="task-context-group-heading"><button onClick={() => setOpen(!open)} aria-expanded={open}>
      {open ? <ChevronDown /> : <ChevronRight />}<span>{title}</span><small>{count}</small>
    </button>{onRefresh && <IconTooltip label={t("tasks:resources.refreshGroup", { category: title })} size="icon-xs" disabled={refreshDisabled || refreshing} aria-busy={refreshing} onClick={onRefresh}><RefreshCw className={refreshing ? "animate-spin" : undefined} /></IconTooltip>}
      {action ?? <IconTooltip label={t("tasks:runtime.addCategory", { category: title })} size="icon-xs" disabled={!onAdd} onClick={onAdd}><Plus /></IconTooltip>}</div>
    {refreshFailed > 0 && <p role="alert" className="px-2 pb-1 text-xs text-destructive">{t("tasks:resources.refreshGroupFailed", { count: refreshFailed })}</p>}
    {open && <div className="task-context-items">{children}</div>}
  </section>;
}
export function TaskResourceRail({ task, sessions, activeId, activeTerminalId, activeResourceId, activeNoteId, onNote, onDeleteNote, onRenameNote, noteDeleteDisabled, onRunCommand, agentChoices = [], onNewSession, onNewSessionFrom, onNewTerminal, onSelect, onRestored, newSessionControl, onArchive, archivePending, newTerminalControl, onReview, onPreview, onIssuePreview, onAttachment, onLink, onAddResource, onFile, activeFile, onWorkspaceOpenError }: TaskResourceRailProps) {
  const { t } = useTranslation(["tasks", "taskCreate", "issues"]);
  const { unread } = useSessionUnread();
  const groupRefresh = useTaskIssueGroupRefresh(task);
  const sessionsLoaded = useTaskSessionStore(state => state.loaded);
  const scrollRef = useReadingPosition<HTMLElement>(readingPositionKey(task.id, "context"), sessionsLoaded);
  const agents = sessions.filter((session) => session.kind === "agent" && !session.archivedAt);
  const archived = sessions.filter((session) => session.kind === "agent" && session.archivedAt);
  const terminals = sessions.filter((session) => session.kind === "shell");
  const sourceSession = (session: TaskSession) => session.sourceSessionId
    ? sessions.find((item) => item.kind === "agent" && item.taskId === session.taskId && item.id === session.sourceSessionId)
    : undefined;
  const repos = task.resources?.filter((resource) => resource.mode !== "folder") ?? [];
  const folders = task.resources?.filter((resource) => resource.mode === "folder") ?? [];
  const prs = task.links?.filter((link) => link.group === "PR") ?? [];
  const issues = task.links?.filter((link) => link.group === "ISSUE") ?? [];
  const archivedPrs = task.archivedLinks?.filter((link) => link.group === "PR") ?? [];
  const archivedIssues = task.archivedLinks?.filter((link) => link.group === "ISSUE") ?? [];
  const webLinks = aggregateTaskWebLinks(task.webLinks ?? []);
  const archivedWebLinks = aggregateTaskWebLinks(task.archivedWebLinks ?? []);
  const readOnly = task.status === "ARCHIVED";
  async function applyBatch(operation: () => Promise<{ undoExpiresAt: string | null } & object>) {
    const result = await operation() as import("@/shared/taskResourceLifecycle").TaskResourceBatchResult;
    useTaskResourceUndoStore.getState().remember(task.id, result);
  }
  function archiveItems(items: TaskResourceRef[], restore = false) {
    return applyBatch(() => restore
      ? useTaskStore.getState().restoreResources(task.id, items)
      : useTaskStore.getState().archiveResources(task.id, items));
  }
  const linksCount = (task.attachments?.length ?? 0) + (task.webLinks?.length ?? 0) + (task.files?.length ?? 0) + folders.length
    + (task.archivedAttachments?.length ?? 0) + (task.archivedWebLinks?.length ?? 0) + (task.archivedFiles?.length ?? 0);
  const notesCount = (task.notes?.length ?? 0) + 1 + (task.archivedNotes?.length ?? 0);
  return <aside ref={scrollRef} className="task-context-rail" aria-label={t("tasks:runtime.context")}>
    <TaskInitializationPanel task={task} />
    <div className="task-context-toolbar"><Button variant="outline" size="sm" className="h-7 w-full gap-1.5 px-2 text-xs" disabled={!onAddResource} onClick={() => onAddResource?.("repositories", true)}><Plus className="size-3.5" />{t("tasks:actions.addResource")}</Button></div>
    <ResourceGroup title={t("tasks:runtime.sessions")} count={agents.length + archived.length} action={newSessionControl}>
      <ArchivedSessions sessions={archived} task={task} onRestored={onRestored} onOpen={onSelect} sourceSession={sourceSession} agentChoices={agentChoices} onNewSessionFrom={onNewSessionFrom} />
      {agents.map((session) => {
        const workspaceLabel = sessionWorkspaceLabel(session, task.resources ?? [], t("tasks:runtime.allWorktrees"), t("tasks:runtime.unknownWorkspace"));
        const workspace = session.workspace;
        const canCreate = task.status !== "ARCHIVED" && Boolean(workspace && (workspace.kind === "all" || task.resources?.some((resource) => resource.resourceId === workspace.resourceId)));
        const hasUnread = unread(session);
        const activity = sessionActivityText(session);
        const statusLabel = "reason" in activity ? t(activity.key, { reason: activity.reason }) : t(activity.key);
        const source = sourceSession(session);
        const onOpenSource = source ? () => onSelect(source, true) : undefined;
        return <TaskSessionMenu key={session.id} session={session} agentChoices={agentChoices} canCreate={canCreate} pending={archivePending} onOpen={() => onSelect(session, true)} onOpenSource={onOpenSource} onArchive={() => onArchive(session.id)} onNewSession={onNewSessionFrom}>
        <div className="task-context-session" data-active={session.id === activeId} data-unread={hasUnread || undefined}>
        <SessionHoverDetails session={session} resources={task.resources ?? []} source={source} onOpenSource={onOpenSource}>
        <button className="task-context-session-select" aria-pressed={session.id === activeId} onClick={() => onSelect(session)}>
          <ContextItemIcon><AgentProviderIcon agentId={session.agent?.agentId} /></ContextItemIcon>
          <span className="min-w-0 flex-1"><span className="flex min-w-0 w-full items-center gap-1"><span className="block min-w-0 truncate">{session.title || t("tasks:runtime.untitledSession")}</span>{hasUnread && <span className="task-context-session-unread" aria-label={t("tasks:runtime.status.unread")} />}</span>
            <span className="task-context-session-metadata">
              <span className="task-context-session-status" data-status={session.status} data-phase={session.phase || undefined}>{statusLabel}</span>
              <span className="shrink-0" aria-hidden="true">·</span>
              <span className="task-context-session-workspace min-w-0 truncate">{workspaceLabel}</span>
            </span>
          </span>
        </button>
        </SessionHoverDetails>
        <IconTooltip label={t("tasks:runtime.archiveSession")} className="task-context-session-archive size-5" size="icon-xs" disabled={archivePending} onClick={() => onArchive(session.id)}><Archive className="size-3" /></IconTooltip>
      </div></TaskSessionMenu>; })}
    </ResourceGroup>
    <ResourceGroup title="CHANGES" count={repos.length} onAdd={onAddResource && (() => onAddResource("repositories"))}>
      {repos.map((resource) => <TaskChangeMenu key={resource.resourceId} task={task} resource={resource} sessions={terminals} agentChoices={agentChoices} pending={archivePending}
        onOpen={() => onReview(resource)} onRunCommand={onRunCommand} onNewSession={onNewSession} onNewTerminal={onNewTerminal} onOpenError={onWorkspaceOpenError}
        onOpenPullRequest={onIssuePreview ? (item) => onIssuePreview(item) : undefined}><div className="task-context-change" data-resource-id={resource.resourceId} data-active={resource.resourceId === activeResourceId}>
        <ChangeHoverDetails taskId={task.id} resource={resource}>
        <button className="task-context-row flex-1" data-active={resource.resourceId === activeResourceId} aria-pressed={resource.resourceId === activeResourceId} onClick={() => onReview(resource)}>
        <ContextItemIcon><GitBranch /></ContextItemIcon><span className="task-context-change-heading min-w-0 flex-1"><span className="block truncate">{resource.targetBranch || resource.sourceBranch}</span></span>
        </button>
        </ChangeHoverDetails>
        <div className="task-context-change-actions"><WorkspaceOpenActions taskId={task.id} resource={resource} onError={onWorkspaceOpenError} />
          <WorkspaceCommandActions taskId={task.id} resource={resource} sessions={terminals} disabled={archivePending || task.status === "ARCHIVED" || !onWorkspaceOpenError} onRun={onRunCommand} />
        </div>
      </div></TaskChangeMenu>)}
    </ResourceGroup>
    {terminals.length > 0 && <ResourceGroup title={t("tasks:runtime.terminals")} count={terminals.length} action={newTerminalControl}>
      {terminals.map((session) => <button key={session.id} className="task-context-row" data-active={session.id === activeTerminalId} aria-pressed={session.id === activeTerminalId} onClick={() => onSelect(session)} title={session.cwd}><ContextItemIcon><Terminal /></ContextItemIcon><span className="truncate">{session.title}</span></button>)}
    </ResourceGroup>}
    <ResourceGroup title="PULL REQUESTS" count={prs.length + archivedPrs.length} onAdd={onAddResource && (() => onAddResource("pullRequests"))}
      onRefresh={() => void groupRefresh.refresh("PR")} refreshing={groupRefresh.state.PR.busy} refreshDisabled={!groupRefresh.available("PR")} refreshFailed={groupRefresh.state.PR.failed}>
      {prs.map((link) => <TaskIssueMenu key={link.id} task={task} item={link}
        onOpen={() => { onIssuePreview ? onIssuePreview(link) : onPreview(link.title, [link.provider, link.repository || link.projectName, link.status].filter(Boolean).join(" · ")) }}
        onRefresh={() => onIssuePreview?.(link, true)}
        onGoWorktree={(resourceId) => { const resource = task.resources?.find((item) => item.resourceId === resourceId); if (resource) onReview(resource); }}>
        <button className="task-context-row" title={link.autoLinked ? String(t("issues:menu.autoLinked")) : link.title} onClick={() => { onIssuePreview ? onIssuePreview(link) : onPreview(link.title, [link.provider, link.repository || link.projectName, link.status].filter(Boolean).join(" · ")) }}><ContextItemIcon><GitPullRequest /></ContextItemIcon><span className="truncate">{link.title}</span></button>
      </TaskIssueMenu>)}
      <RailArchiveList title={t("tasks:resources.archived.toggle")} count={archivedPrs.length}>
        {archivedPrs.map((link) => <TaskIssueMenu key={link.id} task={task} item={link} archived
          onRestore={readOnly ? undefined : () => void archiveItems([{ kind: "issue", id: link.id }], true)}
          onOpen={() => { onIssuePreview ? onIssuePreview(link) : onPreview(link.title, [link.provider, link.repository || link.projectName, link.status].filter(Boolean).join(" · ")) }}>
          <button className="task-context-row" title={link.title} onClick={() => { onIssuePreview ? onIssuePreview(link) : onPreview(link.title, [link.provider, link.repository || link.projectName, link.status].filter(Boolean).join(" · ")) }}><ContextItemIcon><GitPullRequest /></ContextItemIcon><span className="truncate">{link.title}</span></button>
        </TaskIssueMenu>)}
      </RailArchiveList>
    </ResourceGroup>
    <ResourceGroup title="ISSUES" count={issues.length + archivedIssues.length} onAdd={onAddResource && (() => onAddResource("issues"))}
      onRefresh={() => void groupRefresh.refresh("ISSUE")} refreshing={groupRefresh.state.ISSUE.busy} refreshDisabled={!groupRefresh.available("ISSUE")} refreshFailed={groupRefresh.state.ISSUE.failed}>
      {issues.map((link) => <TaskIssueMenu key={link.id} task={task} item={link}
        onOpen={() => { onIssuePreview ? onIssuePreview(link) : onPreview(link.title, [link.provider, link.repository || link.projectName, link.status].filter(Boolean).join(" · ")) }}
        onRefresh={() => onIssuePreview?.(link, true)}>
        <button className="task-context-row" title={link.title} onClick={() => { onIssuePreview ? onIssuePreview(link) : onPreview(link.title, [link.provider, link.repository || link.projectName, link.status].filter(Boolean).join(" · ")) }}><ContextItemIcon><CircleDot /></ContextItemIcon><span className="truncate">{link.title}</span></button>
      </TaskIssueMenu>)}
      <RailArchiveList title={t("tasks:resources.archived.toggle")} count={archivedIssues.length}>
        {archivedIssues.map((link) => <TaskIssueMenu key={link.id} task={task} item={link} archived
          onRestore={readOnly ? undefined : () => void archiveItems([{ kind: "issue", id: link.id }], true)}
          onOpen={() => { onIssuePreview ? onIssuePreview(link) : onPreview(link.title, [link.provider, link.repository || link.projectName, link.status].filter(Boolean).join(" · ")) }}>
          <button className="task-context-row" title={link.title} onClick={() => { onIssuePreview ? onIssuePreview(link) : onPreview(link.title, [link.provider, link.repository || link.projectName, link.status].filter(Boolean).join(" · ")) }}><ContextItemIcon><CircleDot /></ContextItemIcon><span className="truncate">{link.title}</span></button>
        </TaskIssueMenu>)}
      </RailArchiveList>
    </ResourceGroup>
    <ResourceGroup title="LINKS" count={linksCount} onAdd={onAddResource && (() => onAddResource("links"))}>
      {folders.map((folder) => <TaskChangeMenu key={folder.resourceId} variant="folder" task={task} resource={folder} sessions={terminals} agentChoices={agentChoices} pending={archivePending}
        onOpen={() => onPreview(folder.name, folder.workingPath)} onRunCommand={onRunCommand} onNewSession={onNewSession} onNewTerminal={onNewTerminal} onOpenError={onWorkspaceOpenError}>
        <button className="task-context-row" onClick={() => onPreview(folder.name, folder.workingPath)}><ContextItemIcon><FolderGit2 /></ContextItemIcon><span className="truncate">{folder.name}</span></button>
      </TaskChangeMenu>)}
      {task.attachments?.map((file) => <TaskResourceMenu key={file.id} task={task} resource={{ kind: "attachment", id: file.id }} mode="delete"
        onArchive={readOnly ? undefined : () => void archiveItems([{ kind: "attachment", id: file.id }])}>
        <button className="task-context-row" title={file.name} data-active={activeFile?.kind === "attachment" && activeFile.id === file.id} onClick={() => onAttachment(file.id)}><ContextItemIcon><FileText /></ContextItemIcon><span className="truncate">{file.name}</span></button>
      </TaskResourceMenu>)}
      {task.files?.map((file) => <TaskResourceMenu key={file.id} task={task} resource={{ kind: "file", id: file.id }}
        onArchive={readOnly ? undefined : () => void archiveItems([{ kind: "file", id: file.id }])}>
        <button className="task-context-row" title={file.path} data-active={activeFile?.kind === "file" && activeFile.id === file.id} disabled={!onFile} onClick={() => onFile?.(file.id)}><ContextItemIcon><FileText /></ContextItemIcon><span className="truncate">{file.name}</span></button>
      </TaskResourceMenu>)}
      {webLinks.map((link) => <TaskWebLinkMenu key={link.id} task={task} link={link} onOpen={() => onLink(link.id)}>
        <button className="task-context-row" title={link.url} onClick={() => onLink(link.id)}><ContextItemIcon><Link2 /></ContextItemIcon><span className="truncate">{link.title || link.url}</span></button>
      </TaskWebLinkMenu>)}
      <RailArchiveList title={t("tasks:resources.archived.toggle")} count={(task.archivedAttachments?.length ?? 0) + (task.archivedFiles?.length ?? 0) + archivedWebLinks.length}>
        {task.archivedAttachments?.map((file) => <TaskResourceMenu key={file.id} task={task} resource={{ kind: "attachment", id: file.id }} mode="delete"
          onRestore={readOnly ? undefined : () => void archiveItems([{ kind: "attachment", id: file.id }], true)}>
          <button className="task-context-row" title={file.name} onClick={() => onAttachment(file.id)}><ContextItemIcon><FileText /></ContextItemIcon><span className="truncate">{file.name}</span></button>
        </TaskResourceMenu>)}
        {task.archivedFiles?.map((file) => <TaskResourceMenu key={file.id} task={task} resource={{ kind: "file", id: file.id }}
          onRestore={readOnly ? undefined : () => void archiveItems([{ kind: "file", id: file.id }], true)}>
          <button className="task-context-row" title={file.path} disabled={!onFile} onClick={() => onFile?.(file.id)}><ContextItemIcon><FileText /></ContextItemIcon><span className="truncate">{file.name}</span></button>
        </TaskResourceMenu>)}
        {archivedWebLinks.map((link) => <TaskWebLinkMenu key={link.id} task={task} link={link} archived onOpen={() => onLink(link.id)}>
          <button className="task-context-row" title={link.url} onClick={() => onLink(link.id)}><ContextItemIcon><Link2 /></ContextItemIcon><span className="truncate">{link.title || link.url}</span></button>
        </TaskWebLinkMenu>)}
      </RailArchiveList>
    </ResourceGroup>
    <ResourceGroup title="NOTES" count={notesCount} onAdd={onAddResource && (() => onAddResource("notes"))}>
      <TaskNoteRow taskId={task.id} note={{ id: TASK_PROMPT_ID, title: t("tasks:context.prompt"), content: task.description ?? "" }} active={activeNoteId === TASK_PROMPT_ID} deleteDisabled onOpen={onNote} />
      {task.notes?.map((note) => <TaskNoteRow key={note.id} taskId={task.id} note={note} active={note.id === activeNoteId} deleteDisabled={noteDeleteDisabled || readOnly} onOpen={onNote} onDelete={onDeleteNote} onRename={onRenameNote}
        onArchive={readOnly ? undefined : () => void archiveItems([{ kind: "note", id: note.id }])} />)}
      <RailArchiveList title={t("tasks:resources.archived.toggle")} count={task.archivedNotes?.length ?? 0}>
        {task.archivedNotes?.map((note) => <TaskNoteRow key={note.id} taskId={task.id} note={note} active={false} deleteDisabled={noteDeleteDisabled || readOnly} onOpen={() => onPreview(note.title || t("tasks:resources.untitledNote"), note.content)}
          onRestore={readOnly ? undefined : () => void archiveItems([{ kind: "note", id: note.id }], true)} />)}
      </RailArchiveList>
    </ResourceGroup>
  </aside>;
}

interface RailArchiveListProps {
  title: string;
  count: number;
  children: ReactNode;
}
function RailArchiveList({ title, count, children }: RailArchiveListProps) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return <div className="mt-1">
    <button type="button" data-archived-toggle className="flex w-full items-center gap-1 px-1 py-0.5 text-[10px] text-muted-foreground" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}<span>{title}</span><small>{count}</small>
    </button>
    {open && <div data-resource-archived className="task-context-items">{children}</div>}
  </div>;
}
