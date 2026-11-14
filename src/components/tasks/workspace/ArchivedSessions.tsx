import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskSession } from "@/shared/taskSessionTypes";
import type { Task } from "@/domain/tasks";
import type { AgentId } from "@/shared/agentTypes";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { archivedSessionMatches } from "@/utils/archivedSessionSearch";
import { sessionWorkspaceLabel } from "@/utils/taskSessionWorkspace";
import { Input } from "@/components/ui/input";
import { AgentProviderIcon } from "./AgentProviderIcon";
import { SessionActionMenu } from "./SessionActionMenu";
import { TaskSessionMenu } from "./TaskSessionMenu";

interface ArchivedSessionsProps {
  /** 只包含本任务的归档 Agent 会话。 */
  sessions: TaskSession[];
  task: Task;
  /** 仅选择恢复后的已停止会话，不启动 CLI。 */
  onRestored: (session: TaskSession) => void;
  /** 只读打开归档会话，不恢复、不启动。 */
  onOpen: (session: TaskSession) => void;
  /** 沿用工作台的可用 Agent 快照，不在展开菜单时检测。 */
  agentChoices?: Array<{ id: AgentId; ready: boolean }>;
  /** 归档记录仅作为目录来源，新建不恢复原会话。 */
  onNewSessionFrom?: (agentId: AgentId, sourceSessionId: string) => void;
}
export function ArchivedSessions({ sessions, task, onRestored, onOpen, agentChoices = [], onNewSessionFrom }: ArchivedSessionsProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pending = useTaskSessionStore((state) => state.pending);
  const allWorktrees = t("tasks:runtime.allWorktrees");
  const unknownWorkspace = t("tasks:runtime.unknownWorkspace");
  const visible = sessions.flatMap((session) => {
    const workspaceLabel = sessionWorkspaceLabel(session, task.resources ?? [], allWorktrees, unknownWorkspace);
    if (!archivedSessionMatches(session.title, workspaceLabel, query)) return [];
    const workspace = session.workspace;
    const canCreate = task.status !== "ARCHIVED" && Boolean(workspace && (workspace.kind === "all" || task.resources?.some((resource) => resource.resourceId === workspace.resourceId)));
    return [{ session, workspaceLabel, canCreate }];
  });
  if (!sessions.length) return null;
  async function restore(session: TaskSession) {
    await useTaskSessionStore.getState().restore(session.id);
    const restored = useTaskSessionStore.getState().sessions.find((item) => item.id === session.id);
    if (restored && !restored.archivedAt) onRestored(restored);
  }
  return <div>
    <button className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}{t("tasks:context.archived", { count: sessions.length })}
    </button>
    {open && <div className="px-2 pb-1"><Input aria-label={t("tasks:context.archivedSearch")} className="h-7 text-xs" placeholder={t("tasks:context.archivedSearch")} value={query} onChange={(event) => setQuery(event.target.value)} /></div>}
    {open && visible.map(({ session, workspaceLabel, canCreate }) => <TaskSessionMenu key={session.id} session={session} agentChoices={agentChoices} canCreate={canCreate} pending={pending}
      onRestore={task.status !== "ARCHIVED" ? () => void restore(session) : undefined} onNewSession={onNewSessionFrom}>
      <div className="flex items-center"><button className="task-context-row min-w-0 flex-1"
      title={t("tasks:context.readArchived")} onClick={() => onOpen(session)}>
      <span className="task-context-item-icon"><AgentProviderIcon agentId={session.agent?.agentId} /></span>
      <span className="min-w-0"><span className="block truncate">{session.title || t("tasks:runtime.untitledSession")}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{workspaceLabel}</span>
      </span>
    </button><SessionActionMenu session={session} /></div></TaskSessionMenu>)}
    {open && query.trim() && visible.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">{t("tasks:context.archivedEmpty")}</p>}
  </div>;
}
