import { useState } from "react";
import type { ReactNode } from "react";
import { Archive, ChevronDown, ChevronRight, CircleDot, FileText, FolderGit2, GitPullRequest, Link2, Plus, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import type { TaskResource } from "@/shared/taskTypes";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Button } from "@/components/ui/button";
import { AgentProviderIcon } from "./AgentProviderIcon";

interface TaskResourceRailProps {
  /** 只展示真实关联资源，不填充 demo 条目。 */
  task: Task;
  sessions: TaskSession[];
  activeId?: string;
  /** 仅在终端面板可见时提供，收起后不高亮条目。 */
  activeTerminalId?: string;
  /** 选择不同项切换并展示，相同项切换面板显隐，不启动新进程。 */
  onSelect: (session: TaskSession) => void;
  /** 与会话面板共用仅选择 Agent 的新建菜单。 */
  newSessionControl: ReactNode;
  /** 归档为独立操作，不触发选择；归档会终止进程并保留历史记录。 */
  onArchive: (id: string) => void;
  archivePending: boolean;
  onAddTerminal: () => void;
  onReview: (resource: TaskResource) => void;
  onPreview: (title: string, body: string) => void;
  onAttachment: (id: string) => void;
  onLink: (id: string) => void;
}
interface ResourceGroupProps {
  /** 各分组独立展开收起，不影响当前内容和进程。 */
  title: string;
  count: number;
  children: ReactNode;
  action?: ReactNode;
}
function ResourceGroup({ title, count, children, action }: ResourceGroupProps) {
  const [open, setOpen] = useState(true);
  if (count === 0) return null;
  return <section className="task-context-group">
    <div className="task-context-group-heading"><button onClick={() => setOpen(!open)} aria-expanded={open}>
      {open ? <ChevronDown /> : <ChevronRight />}<span>{title}</span><small>{count}</small>
    </button>{action}</div>
    {open && <div className="task-context-items">{children}</div>}
  </section>;
}
export function TaskResourceRail({ task, sessions, activeId, activeTerminalId, onSelect, newSessionControl, onArchive, archivePending, onAddTerminal, onReview, onPreview, onAttachment, onLink }: TaskResourceRailProps) {
  const { t } = useTranslation(["tasks", "taskCreate"]);
  const agents = sessions.filter((session) => session.kind === "agent" && !session.archivedAt);
  const terminals = sessions.filter((session) => session.kind === "shell");
  const repos = task.resources?.filter((resource) => resource.mode !== "folder") ?? [];
  const folders = task.resources?.filter((resource) => resource.mode === "folder") ?? [];
  const prs = task.links?.filter((link) => link.group === "PR") ?? [];
  const issues = task.links?.filter((link) => link.group === "ISSUE") ?? [];
  return <aside className="task-context-rail" aria-label={t("tasks:runtime.context")}>
    <div className="task-context-toolbar"><Button variant="outline" size="sm" className="h-7 w-full gap-1.5 px-2 text-xs" disabled><Plus className="size-3.5" />{t("tasks:actions.addResource")}</Button></div>
    <ResourceGroup title={t("tasks:runtime.sessions")} count={agents.length} action={newSessionControl}>
      {agents.map((session) => <div key={session.id} className="task-context-session" data-active={session.id === activeId}>
        <button className="task-context-session-select" aria-pressed={session.id === activeId} onClick={() => onSelect(session)} title={session.title || t("tasks:runtime.untitledSession")}>
          <AgentProviderIcon agentId={session.agent?.agentId} />
          <span className="min-w-0 flex-1"><span className="block truncate">{session.title || t("tasks:runtime.untitledSession")}</span>
            <span className="task-context-session-status" data-status={session.status}>{t(`tasks:runtime.status.${session.status}`)}</span>
          </span>
        </button>
        <IconTooltip label={t("tasks:runtime.archiveSession")} className="task-context-session-archive" size="icon-xs" disabled={archivePending} onClick={() => onArchive(session.id)}><Archive className="size-3.5" /></IconTooltip>
      </div>)}
    </ResourceGroup>
    <ResourceGroup title="CHANGES" count={repos.length}>
      {repos.map((resource) => <button key={resource.resourceId} className="task-context-row" onClick={() => onReview(resource)} title={resource.workingPath}>
        <FolderGit2 /><span className="min-w-0 flex-1"><span className="block truncate">{resource.name}</span><small className="block truncate text-muted-foreground">{resource.targetBranch || resource.sourceBranch}</small></span>
      </button>)}
    </ResourceGroup>
    {terminals.length > 0 && <ResourceGroup title={t("tasks:runtime.terminals")} count={terminals.length} action={<IconTooltip label={t("tasks:runtime.newTerminal")} size="icon-xs" onClick={onAddTerminal}><Plus /></IconTooltip>}>
      {terminals.map((session) => <button key={session.id} className="task-context-row" data-active={session.id === activeTerminalId} aria-pressed={session.id === activeTerminalId} onClick={() => onSelect(session)} title={session.cwd}><Terminal /><span className="truncate">{session.title}</span></button>)}
    </ResourceGroup>}
    <ResourceGroup title="PULL REQUESTS" count={prs.length}>{prs.map((link) => <button key={link.id} className="task-context-row" title={link.title} onClick={() => onPreview(link.title, [link.provider, link.repository || link.projectName, link.status].filter(Boolean).join(" · "))}><GitPullRequest /><span className="truncate">{link.title}</span></button>)}</ResourceGroup>
    <ResourceGroup title="ISSUES" count={issues.length}>{issues.map((link) => <button key={link.id} className="task-context-row" title={link.title} onClick={() => onPreview(link.title, [link.provider, link.repository || link.projectName, link.status].filter(Boolean).join(" · "))}><CircleDot /><span className="truncate">{link.title}</span></button>)}</ResourceGroup>
    <ResourceGroup title="LINKS" count={(task.attachments?.length ?? 0) + (task.webLinks?.length ?? 0) + folders.length}>
      {folders.map((folder) => <button key={folder.resourceId} className="task-context-row" onClick={() => onPreview(folder.name, folder.workingPath)}><FolderGit2 /><span className="truncate">{folder.name}</span></button>)}
      {task.attachments?.map((file) => <button key={file.id} className="task-context-row" title={file.name} onClick={() => onAttachment(file.id)}><FileText /><span className="truncate">{file.name}</span></button>)}
      {task.webLinks?.map((link) => <button key={link.id} className="task-context-row" title={link.url} onClick={() => onLink(link.id)}><Link2 /><span className="truncate">{link.title || link.url}</span></button>)}
    </ResourceGroup>
  </aside>;
}
