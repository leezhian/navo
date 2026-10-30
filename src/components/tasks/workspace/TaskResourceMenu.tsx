import { useState } from "react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import type { TaskResourceRemoval } from "@/shared/taskContextTypes";
import { useTaskStore } from "@/stores/taskStore";
import { getTaskError } from "@/services/taskErrors";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TaskResourceMenuProps {
  /** 当前任务用于归档只读检查，删除请求只传资源标识。 */
  task: Task;
  resource: TaskResourceRemoval;
  /** 保留原条目的点击、布局与键盘语义。 */
  children: ReactElement;
}
export function TaskResourceMenu({ task, resource, children }: TaskResourceMenuProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const pending = useTaskStore((state) => state.pending);
  async function detach() {
    if (busy || pending) return;
    setBusy(true); setError(null);
    try { await useTaskStore.getState().detachResource(task.id, resource); setOpen(false); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <>
    <ContextMenu><ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent onCloseAutoFocus={(event) => { if (open) event.preventDefault(); }}>
        <ContextMenuItem variant="destructive" disabled={task.status === "ARCHIVED" || pending} onSelect={() => { setError(null); setOpen(true); }}>{t("tasks:context.detach")}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}><DialogContent>
      <DialogTitle>{t("tasks:context.detachTitle")}</DialogTitle><DialogDescription>{t("tasks:context.detachDescription")}</DialogDescription>
      {error !== null && <p role="alert" className="text-xs text-destructive">{getTaskError(error)}</p>}
      <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>{t("common:actions.cancel")}</Button>
        <Button variant="destructive" size="sm" disabled={pending || busy} onClick={() => void detach()}>{t("tasks:context.detach")}</Button></div>
    </DialogContent></Dialog>
  </>;
}
