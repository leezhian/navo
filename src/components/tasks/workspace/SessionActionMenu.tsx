import { useState } from "react";
import { Archive, ChevronDown, Pencil, Power, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SessionActionDialog, type SessionDialogAction } from "./SessionActionDialog";

interface SessionActionMenuProps {
  /** 所有操作只作用于当前会话，不删除任务或工作目录。 */
  session: TaskSession;
  /** 已归档任务允许查看记录，但禁止启动或恢复 Agent。 */
  taskArchived?: boolean;
}
export function SessionActionMenu({ session, taskArchived = false }: SessionActionMenuProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const pending = useTaskSessionStore((state) => state.pending);
  const [action, setAction] = useState<SessionDialogAction | null>(null);
  const nativeSupported = Boolean(session.nativeSessionId && ["claude", "grok"].includes(session.agent?.agentId ?? ""));
  const running = session.status === "running" || session.status === "starting";
  const canRestart = Boolean(session.resumable && session.nativeSessionId);
  function openAction(next: SessionDialogAction) {
    useTaskSessionStore.setState({ error: null });
    setAction(next);
  }
  return <>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground" aria-label={t("tasks:runtime.sessionActions")} disabled={pending}><ChevronDown className="size-3.5" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onCloseAutoFocus={(event) => { if (action) event.preventDefault(); }}>
        {!session.archivedAt && <>
        <DropdownMenuItem className="text-xs" disabled={!nativeSupported || pending} onSelect={() => openAction("rename")}><Pencil className="size-3.5" />{t("tasks:runtime.renameSession")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs" disabled={pending || taskArchived || !canRestart} title={!canRestart ? t("tasks:runtime.restartUnavailable") : undefined} onSelect={() => void useTaskSessionStore.getState().restart(session.id, false)}><RotateCcw className="size-3.5" />{t("tasks:runtime.restartAgent")}</DropdownMenuItem>
        <DropdownMenuItem className="text-xs" disabled={pending || !running} onSelect={() => void useTaskSessionStore.getState().stop(session.id)}><Power className="size-3.5" />{t("tasks:runtime.shutdownAgent")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs" disabled={pending} onSelect={() => void useTaskSessionStore.getState().archive(session.id)}><Archive className="size-3.5" />{t("tasks:runtime.archiveSession")}</DropdownMenuItem>
        </>}
        <DropdownMenuItem className="text-xs" variant="destructive" disabled={!nativeSupported || pending} onSelect={() => openAction("delete")}><Trash2 className="size-3.5" />{t("tasks:runtime.deleteSession")}</DropdownMenuItem>
        {!nativeSupported && <p className="px-2 py-1.5 text-[11px] text-muted-foreground">{t("tasks:runtime.nativeActionsUnavailable")}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
    {action && <SessionActionDialog key={session.id + action} session={session} action={action} onClose={() => setAction(null)} />}
  </>;
}
