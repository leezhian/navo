import { useState } from "react";
import { Archive, ChevronDown, Pencil, Power, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";

interface SessionActionMenuProps {
  /** 所有操作只作用于当前会话，不删除任务或工作目录。 */
  session: TaskSession;
}
export function SessionActionMenu({ session }: SessionActionMenuProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const pending = useTaskSessionStore((state) => state.pending);
  const error = useTaskSessionStore((state) => state.error);
  const [action, setAction] = useState<"rename" | "delete" | null>(null);
  const [title, setTitle] = useState(session.title);
  const nativeSupported = Boolean(session.nativeSessionId && ["claude", "grok"].includes(session.agent?.agentId ?? ""));
  const sessionName = session.title || t("tasks:runtime.untitledSession");
  const running = session.status === "running" || session.status === "starting";
  async function confirm() {
    const store = useTaskSessionStore.getState();
    if (action === "rename") await store.rename(session.id, title);
    else await store.remove(session.id);
    if (!useTaskSessionStore.getState().error) setAction(null);
  }
  function openAction(next: "rename" | "delete") {
    useTaskSessionStore.setState({ error: null });
    setTitle(session.title); setAction(next);
  }
  return <>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" aria-label={t("tasks:runtime.sessionActions")} disabled={pending}><ChevronDown className="size-3.5" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem className="text-xs" disabled={!nativeSupported || pending} onSelect={() => openAction("rename")}><Pencil className="size-3.5" />{t("tasks:runtime.renameSession")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs" disabled={pending} onSelect={() => void useTaskSessionStore.getState().restart(session.id, false)}><RotateCcw className="size-3.5" />{t("tasks:runtime.restartAgent")}</DropdownMenuItem>
        <DropdownMenuItem className="text-xs" disabled={pending || !running} onSelect={() => void useTaskSessionStore.getState().stop(session.id)}><Power className="size-3.5" />{t("tasks:runtime.shutdownAgent")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs" disabled={pending} onSelect={() => void useTaskSessionStore.getState().archive(session.id)}><Archive className="size-3.5" />{t("tasks:runtime.archiveSession")}</DropdownMenuItem>
        <DropdownMenuItem className="text-xs" variant="destructive" disabled={!nativeSupported || pending} onSelect={() => openAction("delete")}><Trash2 className="size-3.5" />{t("tasks:runtime.deleteSession")}</DropdownMenuItem>
        {!nativeSupported && <p className="px-2 py-1.5 text-[11px] text-muted-foreground">{t("tasks:runtime.nativeActionsUnavailable")}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={action !== null} onOpenChange={(open) => { if (!open && !pending) setAction(null); }}>
      <DialogContent className="sm:max-w-md" showCloseButton={!pending} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onInteractOutside={(event) => { if (pending) event.preventDefault(); }}>
        <DialogTitle>{t(action === "rename" ? "tasks:runtime.renameSession" : "tasks:runtime.deleteSession")}</DialogTitle>
        <DialogDescription>{action === "rename" ? t("tasks:runtime.renameNativeDescription") : t("tasks:runtime.deleteNativeDescription", { name: sessionName })}</DialogDescription>
        {action === "rename" && <Input autoFocus aria-label={t("tasks:runtime.sessionName")} maxLength={160} value={title} disabled={pending} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && title.trim() && !pending) void confirm(); }} />}
        {error && <p role="alert" className="text-xs text-destructive">{t("tasks:runtime.nativeActionFailed")}</p>}
        <DialogFooter>
          <Button variant="ghost" autoFocus={action === "delete"} disabled={pending} onClick={() => setAction(null)}>{t("common:actions.cancel")}</Button>
          <Button variant={action === "delete" ? "destructive" : "default"} disabled={pending || (action === "rename" && !title.trim())} onClick={() => void confirm()}>{t(action === "delete" ? "common:actions.delete" : "common:actions.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
