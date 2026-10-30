import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskSession } from "@/shared/taskSessionTypes";
import type { Task } from "@/domain/tasks";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { sessionWorkspaceLabel } from "@/utils/taskSessionWorkspace";
import { AgentProviderIcon } from "./AgentProviderIcon";
import { SessionActionMenu } from "./SessionActionMenu";

interface ArchivedSessionsProps {
  /** 只包含本任务的归档 Agent 会话。 */
  sessions: TaskSession[];
  task: Task;
  /** 仅选择恢复后的已停止会话，不启动 CLI。 */
  onRestored: (session: TaskSession) => void;
}
export function ArchivedSessions({ sessions, task, onRestored }: ArchivedSessionsProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const [open, setOpen] = useState(false);
  const pending = useTaskSessionStore((state) => state.pending);
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
    {open && sessions.map((session) => <div key={session.id} className="flex items-center"><button className="task-context-row min-w-0 flex-1" disabled={pending || task.status === "ARCHIVED"}
      title={t("tasks:context.restoreSession", { date: new Date(session.archivedAt ?? session.createdAt).toLocaleString() })} onClick={() => void restore(session)}>
      <span className="task-context-item-icon"><AgentProviderIcon agentId={session.agent?.agentId} /></span>
      <span className="min-w-0"><span className="block truncate">{session.title || t("tasks:runtime.untitledSession")}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{sessionWorkspaceLabel(session, task.resources ?? [], t("tasks:runtime.allWorktrees"), t("tasks:runtime.unknownWorkspace"))}</span>
      </span>
    </button><SessionActionMenu session={session} /></div>)}
  </div>;
}
