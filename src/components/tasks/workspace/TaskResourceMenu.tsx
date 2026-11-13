import { useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import type { TaskResourceRemoval } from "@/shared/taskContextTypes";
import { useTaskStore } from "@/stores/taskStore";
import { getTaskError } from "@/services/taskErrors";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TaskResourceMenuProps {
  /** 当前任务用于归档只读检查，删除请求只传资源标识。 */
  task: Task;
  resource: TaskResourceRemoval;
  /** 保留原条目的点击、布局与键盘语义。 */
  children: ReactElement;
  /** CHANGES 的常规操作，放在解除关联前并以分割线分组。 */
  actions?: ReactNode;
  /** CHANGES 的物理删除操作，放在解除关联之后。 */
  trailingActions?: ReactNode;
}
export function TaskResourceMenu({ task, resource, children, actions, trailingActions }: TaskResourceMenuProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const selectedAction = useRef(false);
  const pending = useTaskStore((state) => state.pending);
  const lastWorkspace = resource.kind === "workspace" && (task.resources?.length ?? 0) <= 1;
  const detachDisabled = task.status === "ARCHIVED" || pending || lastWorkspace;
  async function detach() {
    if (busy || detachDisabled) return;
    setBusy(true); setError(null);
    try { await useTaskStore.getState().detachResource(task.id, resource); setOpen(false); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <>
    <ContextMenu onOpenChange={(opened) => { if (opened) selectedAction.current = false; }}><ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="[&_svg]:size-3.5!" updatePositionStrategy="always" onClickCapture={() => { selectedAction.current = true; }}
        onKeyDownCapture={(event) => { if (event.key === "Enter" || event.key === " ") selectedAction.current = true; }}
        onCloseAutoFocus={(event) => { if (open || selectedAction.current) event.preventDefault(); }}>
        {actions && <>{actions}<ContextMenuSeparator /></>}
        <ContextMenuItem variant="destructive" disabled={detachDisabled} onSelect={() => { setError(null); setOpen(true); }}>{t("tasks:context.detach")}</ContextMenuItem>
        {trailingActions}
      </ContextMenuContent>
    </ContextMenu>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}><DialogContent>
      <DialogTitle>{t("tasks:context.detachTitle")}</DialogTitle><DialogDescription>{t("tasks:context.detachDescription")}</DialogDescription>
      {error !== null && <p role="alert" className="text-xs text-destructive">{getTaskError(error)}</p>}
      <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>{t("common:actions.cancel")}</Button>
        <Button variant="destructive" size="sm" disabled={detachDisabled || busy} onClick={() => void detach()}>{t("tasks:context.detach")}</Button></div>
    </DialogContent></Dialog>
  </>;
}
