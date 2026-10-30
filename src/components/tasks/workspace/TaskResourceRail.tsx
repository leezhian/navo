import { useState } from "react";
import type { ReactNode } from "react";
import { Archive, ChevronDown, ChevronRight, CircleDot, FileText, FolderGit2, GitBranch, GitPullRequest, Link2, Plus, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import type { TaskResource } from "@/shared/taskTypes";
import type { TaskSession } from "@/shared/taskSessionTypes";
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
import { ArchivedSessions } from "./ArchivedSessions";
import { TaskInitializationPanel } from "./TaskInitializationPanel";

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
  noteDeleteDisabled: boolean;
  /** 在所选工作区的独立终端运行仓库命令。 */
  onRunCommand: (resourceId: string, commandId: string) => void;
  /** 选择不同项切换并展示，相同项切换面板显隐，不启动新进程。 */
  onSelect: (session: TaskSession) => void;
  /** 与会话面板共用工作目录及 Agent 新建菜单。 */
  newSessionControl: ReactNode;
  /** 归档为独立操作，不触发选择；归档会终止进程并保留历史记录。 */
  onArchive: (id: string) => void;
  archivePending: boolean;
  /** 与终端面板共用的新建入口，多目录时先选择工作目录。 */
  newTerminalControl: ReactNode;
  onReview: (resource: TaskResource) => void;
  onPreview: (title: string, body: string) => void;
  onAttachment: (id: string) => void;
  onLink: (id: string) => void;
  /** 正式页打开统一资源窗口；独立 demo 可省略以保持只读。 */
  onAddResource?: (category: TaskResourceCategory) => void;
  /** 定位原文件，不走复制附件接口。 */
  onFile?: (id: string) => void;
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
}
interface ContextItemIconProps {
  /** 仅承载条目前置图标，分类及操作按钮不使用背景容器。 */
  children: ReactNode;
}
function ContextItemIcon({ children }: ContextItemIconProps) {
  return <span className="task-context-item-icon">{children}</span>;
}
function ResourceGroup({ title, count, children, action, onAdd }: ResourceGroupProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const [open, setOpen] = useState(true);
  if (count === 0) return null;
  return <section className="task-context-group">
    <div className="task-context-group-heading"><button onClick={() => setOpen(!open)} aria-expanded={open}>
      {open ? <ChevronDown /> : <ChevronRight />}<span>{title}</span><small>{count}</small>
    </button>{action ?? <IconTooltip label={t("tasks:runtime.addCategory", { category: title })} size="icon-xs" disabled={!onAdd} onClick={onAdd}><Plus /></IconTooltip>}</div>
    {open && <div className="task-context-items">{children}</div>}
  </section>;
}
export function TaskResourceRail({ task, sessions, activeId, activeTerminalId, activeResourceId, activeNoteId, onNote, onDeleteNote, noteDeleteDisabled, onRunCommand, onSelect, newSessionControl, onArchive, archivePending, newTerminalControl, onReview, onPreview, onAttachment, onLink, onAddResource, onFile, onWorkspaceOpenError }: TaskResourceRailProps) {
  const { t } = useTranslation(["tasks", "taskCreate"]);
  const agents = sessions.filter((session) => session.kind === "agent" && !session.archivedAt);
  const archived = sessions.filter((session) => session.kind === "agent" && session.archivedAt);
  const terminals = sessions.filter((session) => session.kind === "shell");
  const repos = task.resources?.filter((resource) => resource.mode !== "folder") ?? [];
  const folders = task.resources?.filter((resource) => resource.mode === "folder") ?? [];
  const prs = task.links?.filter((link) => link.group === "PR") ?? [];
  const issues = task.links?.filter((link) => link.group === "ISSUE") ?? [];
  return <aside className="task-context-rail" aria-label={t("tasks:runtime.context")}>
    <TaskInitializationPanel task={task} />
    <div className="task-context-toolbar"><Button variant="outline" size="sm" className="h-7 w-full gap-1.5 px-2 text-xs" disabled={!onAddResource} onClick={() => onAddResource?.("repositories")}><Plus className="size-3.5" />{t("tasks:actions.addResource")}</Button></div>
    <ResourceGroup title={t("tasks:runtime.sessions")} count={agents.length + archived.length} action={newSessionControl}>
      <ArchivedSessions sessions={archived} task={task} onRestored={onSelect} />
      {agents.map((session) => {
        const workspaceLabel = sessionWorkspaceLabel(session, task.resources ?? [], t("tasks:runtime.allWorktrees"), t("tasks:runtime.unknownWorkspace"));
        return <div key={session.id} className="task-context-session" data-active={session.id === activeId}>
        <button className="task-context-session-select" aria-pressed={session.id === activeId} onClick={() => onSelect(session)} title={session.title || t("tasks:runtime.untitledSession")}>
          <ContextItemIcon><AgentProviderIcon agentId={session.agent?.agentId} /></ContextItemIcon>
          <span className="min-w-0 flex-1"><span className="block truncate">{session.title || t("tasks:runtime.untitledSession")}</span>
            <span className="task-context-session-metadata">
              <span className="task-context-session-status" data-status={session.status}>{t(`tasks:runtime.status.${session.status}`)}</span>
              <span className="shrink-0" aria-hidden="true">·</span>
              <span className="task-context-session-workspace min-w-0 truncate" title={workspaceLabel}>{workspaceLabel}</span>
            </span>
          </span>
        </button>
        <IconTooltip label={t("tasks:runtime.archiveSession")} className="task-context-session-archive size-5" size="icon-xs" disabled={archivePending} onClick={() => onArchive(session.id)}><Archive className="size-3" /></IconTooltip>
      </div>; })}
    </ResourceGroup>
    <ResourceGroup title="CHANGES" count={repos.length} onAdd={onAddResource && (() => onAddResource("repositories"))}>
      {repos.map((resource) => <TaskResourceMenu key={resource.resourceId} task={task} resource={{ kind: "workspace", id: resource.resourceId }}><div className="task-context-change" data-active={resource.resourceId === activeResourceId}>
        <button className="task-context-row flex-1" data-active={resource.resourceId === activeResourceId} aria-pressed={resource.resourceId === activeResourceId} onClick={() => onReview(resource)} title={resource.workingPath}>
        <ContextItemIcon><GitBranch /></ContextItemIcon><span className="task-context-change-heading min-w-0 flex-1"><span className="block truncate">{resource.targetBranch || resource.sourceBranch}</span></span>
        </button><div className="task-context-change-actions"><WorkspaceOpenActions taskId={task.id} resource={resource} onError={onWorkspaceOpenError} />
          <WorkspaceCommandActions resource={resource} sessions={terminals} disabled={archivePending || task.status === "ARCHIVED" || !onWorkspaceOpenError} onRun={onRunCommand} />
        </div>
      </div></TaskResourceMenu>)}
    </ResourceGroup>
    {terminals.length > 0 && <ResourceGroup title={t("tasks:runtime.terminals")} count={terminals.length} action={newTerminalControl}>
      {terminals.map((session) => <button key={session.id} className="task-context-row" data-active={session.id === activeTerminalId} aria-pressed={session.id === activeTerminalId} onClick={() => onSelect(session)} title={session.cwd}><ContextItemIcon><Terminal /></ContextItemIcon><span className="truncate">{session.title}</span></button>)}
    </ResourceGroup>}
    <ResourceGroup title="PULL REQUESTS" count={prs.length} onAdd={onAddResource && (() => onAddResource("pullRequests"))}>{prs.map((link) => <TaskResourceMenu key={link.id} task={task} resource={{ kind: "issue", id: link.id }}><button className="task-context-row" title={link.title} onClick={() => onPreview(link.title, [link.provider, link.repository || link.projectName, link.status].filter(Boolean).join(" · "))}><ContextItemIcon><GitPullRequest /></ContextItemIcon><span className="truncate">{link.title}</span></button></TaskResourceMenu>)}</ResourceGroup>
    <ResourceGroup title="ISSUES" count={issues.length} onAdd={onAddResource && (() => onAddResource("issues"))}>{issues.map((link) => <TaskResourceMenu key={link.id} task={task} resource={{ kind: "issue", id: link.id }}><button className="task-context-row" title={link.title} onClick={() => onPreview(link.title, [link.provider, link.repository || link.projectName, link.status].filter(Boolean).join(" · "))}><ContextItemIcon><CircleDot /></ContextItemIcon><span className="truncate">{link.title}</span></button></TaskResourceMenu>)}</ResourceGroup>
    <ResourceGroup title="LINKS" count={(task.attachments?.length ?? 0) + (task.webLinks?.length ?? 0) + (task.files?.length ?? 0) + folders.length} onAdd={onAddResource && (() => onAddResource("links"))}>
      {folders.map((folder) => <TaskResourceMenu key={folder.resourceId} task={task} resource={{ kind: "workspace", id: folder.resourceId }}><button className="task-context-row" onClick={() => onPreview(folder.name, folder.workingPath)}><ContextItemIcon><FolderGit2 /></ContextItemIcon><span className="truncate">{folder.name}</span></button></TaskResourceMenu>)}
      {task.attachments?.map((file) => <TaskResourceMenu key={file.id} task={task} resource={{ kind: "attachment", id: file.id }}><button className="task-context-row" title={file.name} onClick={() => onAttachment(file.id)}><ContextItemIcon><FileText /></ContextItemIcon><span className="truncate">{file.name}</span></button></TaskResourceMenu>)}
      {task.files?.map((file) => <TaskResourceMenu key={file.id} task={task} resource={{ kind: "file", id: file.id }}><button className="task-context-row" title={file.path} disabled={!onFile} onClick={() => onFile?.(file.id)}><ContextItemIcon><FileText /></ContextItemIcon><span className="truncate">{file.name}</span></button></TaskResourceMenu>)}
      {task.webLinks?.map((link) => <TaskResourceMenu key={link.id} task={task} resource={{ kind: "link", id: link.id }}><button className="task-context-row" title={link.url} onClick={() => onLink(link.id)}><ContextItemIcon><Link2 /></ContextItemIcon><span className="truncate">{link.title || link.url}</span></button></TaskResourceMenu>)}
    </ResourceGroup>
    <ResourceGroup title="NOTES" count={(task.notes?.length ?? 0) + 1} onAdd={onAddResource && (() => onAddResource("notes"))}>
      <button className="task-context-row" data-active={activeNoteId === TASK_PROMPT_ID} aria-pressed={activeNoteId === TASK_PROMPT_ID} onClick={(event) => onNote(TASK_PROMPT_ID, event.currentTarget)}><ContextItemIcon><FileText /></ContextItemIcon><span className="truncate">{t("tasks:context.prompt")}</span></button>
      {task.notes?.map((note) => <TaskNoteRow key={note.id} note={note} active={note.id === activeNoteId} deleteDisabled={noteDeleteDisabled} onOpen={onNote} onDelete={onDeleteNote} />)}
    </ResourceGroup>
  </aside>;
}
