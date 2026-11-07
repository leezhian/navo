import { useState } from "react";
import { Archive, Circle, CircleCheck, Ellipsis, FolderPlus, Pencil, Power, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import { useTaskStore } from "@/stores/taskStore";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { getTasksApi } from "@/services/taskApi";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskDeleteDialog } from "../TaskDeleteDialog";
import { TaskAddResourcesDialog } from "../resources/TaskAddResourcesDialog";

interface TaskWorkbenchMenuProps {
  /** 菜单操作只作用于当前任务详情，确认流复用列表右键已有弹窗。 */
  task: Task;
  /** 进入顶栏就地重命名，不新开对话框。 */
  onRename: () => void;
  /** 刷新失败或结果摘要时回写到工作台提示区。 */
  onNotice: (title: string, body: string) => void;
}

type DialogAction = "delete" | "archive" | "resources" | null;

/** 标题旁 ⋯：重命名、改状态、添加资源、关闭全部 Agent、刷新工作区；归档／恢复与删除放最底。 */
export function TaskWorkbenchMenu({ task, onRename, onNotice }: TaskWorkbenchMenuProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const pending = useTaskStore((state) => state.pending);
  const sessionPending = useTaskSessionStore((state) => state.pending);
  const sessions = useTaskSessionStore((state) => state.sessions);
  const [action, setAction] = useState<DialogAction>(null);
  const [refreshing, setRefreshing] = useState(false);
  const archived = task.status === "ARCHIVED";
  const busy = pending || sessionPending || refreshing;
  const agents = sessions.filter((session) => session.taskId === task.id && session.kind === "agent" && !session.archivedAt);
  const repositories = task.resources?.filter((resource) => resource.mode !== "folder") ?? [];
  const runningAgents = agents.filter((session) => session.status === "running" || session.status === "starting");

  async function changeStatus(status: "TODO" | "DONE") {
    if (busy || task.status === status) return;
    const store = useTaskStore.getState();
    if (archived) {
      const restored = await store.restore(task.id);
      if (!restored) return;
    }
    await store.move(task.id, status, null);
  }

  async function closeAllAgents() {
    if (busy || runningAgents.length === 0) return;
    const stop = useTaskSessionStore.getState().stop;
    for (const session of runningAgents) {
      try { await stop(session.id); } catch { /* 单条失败不阻断后续；底部 error 由 store 展示 */ }
    }
  }

  async function refreshWorkspace() {
    if (busy) return;
    if (repositories.length === 0) return;
    setRefreshing(true);
    const failures: string[] = [];
    try {
      for (const resource of repositories) {
        try {
          await getTasksApi().loadBranch(task.id, resource.resourceId);
        } catch {
          failures.push(resource.name || resource.workingPath);
        }
      }
      window.dispatchEvent(new CustomEvent("navo:task-workspace-refresh", { detail: { taskId: task.id } }));
      // 成功静默刷新，只在失败时提示。
      if (failures.length) onNotice(t("tasks:actions.refreshWorkspaceFailed"), failures.join("\n"));
    } finally {
      setRefreshing(false);
    }
  }

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("tasks:actions.taskMenu")} disabled={busy}>
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52" onCloseAutoFocus={(event) => { if (action) event.preventDefault(); }}>
        <DropdownMenuItem className="text-xs" disabled={busy} onSelect={onRename}>
          <Pencil className="size-3.5" />{t("common:actions.rename")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs" disabled={busy}>
            <Circle className="size-3.5" />{t("tasks:actions.changeStatus")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            {(["TODO", "DONE"] as const).map((status) => (
              <DropdownMenuItem key={status} className="text-xs" disabled={busy || (!archived && task.status === status)}
                onSelect={() => void changeStatus(status)}>
                {status === "TODO" ? <Circle className="size-3.5" /> : <CircleCheck className="size-3.5" />}
                {t(status === "TODO" ? "tasks:actions.markTodo" : "tasks:actions.markDone")}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs" disabled={busy || archived} onSelect={() => setAction("resources")}>
          <FolderPlus className="size-3.5" />{t("tasks:actions.addResource")}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs" disabled={busy || runningAgents.length === 0} onSelect={() => void closeAllAgents()}>
          <Power className="size-3.5" />{t("tasks:actions.closeAllAgents")}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs" disabled={busy || repositories.length === 0} onSelect={() => void refreshWorkspace()}>
          <RefreshCw className="size-3.5" />{t("tasks:actions.refreshWorkspace")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs" disabled={busy}
          onSelect={() => { if (archived) void useTaskStore.getState().restore(task.id); else setAction("archive"); }}>
          <Archive className="size-3.5" />{t(archived ? "common:actions.restore" : "common:actions.archive")}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs" variant="destructive" disabled={busy} onSelect={() => setAction("delete")}>
          <Trash2 className="size-3.5" />{t("common:actions.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {(action === "delete" || action === "archive") && <TaskDeleteDialog task={task} action={action} onClose={() => setAction(null)} />}
    {action === "resources" && <TaskAddResourcesDialog task={task} initialCategory="repositories" onClose={() => setAction(null)} />}
  </>;
}

