import { useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import type { TaskResourceRemoval } from "@/shared/taskContextTypes";
import { useTaskStore } from "@/stores/taskStore";
import { useTaskResourceUndoStore } from "@/stores/taskResourceUndoStore";
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
  /** 附件副本使用删除，其余资源使用解除关联。 */
  mode?: "detach" | "delete";
  /** 笔记、文件、附件、链接可单独归档；已归档任务不提供。 */
  onArchive?: () => void;
  onRestore?: () => void;
  /** 重复链接聚合后一次操作全部 id。 */
  ids?: string[];
}
export function TaskResourceMenu({ task, resource, children, actions, trailingActions, mode = "detach", onArchive, onRestore, ids }: TaskResourceMenuProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const selectedAction = useRef(false);
  const pending = useTaskStore((state) => state.pending);
  const targets = ids?.length ? ids : [resource.id];
  const lastWorkspace = resource.kind === "workspace" && (task.resources?.length ?? 0) <= 1;
  const detachDisabled = task.status === "ARCHIVED" || pending || lastWorkspace;
  async function detach() {
    if (busy || detachDisabled) return;
    setBusy(true); setError(null);
    try {
        if (mode === "delete") {
          const result = await useTaskStore.getState().deleteAttachments(task.id, targets);
          useTaskResourceUndoStore.getState().remember(task.id, result);
        } else {
          const result = await useTaskStore.getState().detachResources(task.id, targets.map((id) => ({ kind: resource.kind, id })));
          useTaskResourceUndoStore.getState().remember(task.id, result);
        }
        setOpen(false);
      }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <>
    <ContextMenu onOpenChange={(opened) => { if (opened) selectedAction.current = false; }}><ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="[&_svg]:size-3.5!" updatePositionStrategy="always" onClickCapture={() => { selectedAction.current = true; }}
        onKeyDownCapture={(event) => { if (event.key === "Enter" || event.key === " ") selectedAction.current = true; }}
        onCloseAutoFocus={(event) => { if (open || selectedAction.current) event.preventDefault(); }}>
        {actions && <>{actions}<ContextMenuSeparator /></>}
        {onRestore && <ContextMenuItem disabled={task.status === "ARCHIVED" || pending} onSelect={() => onRestore()}>{t("tasks:resources.restore")}</ContextMenuItem>}
        {onArchive && <ContextMenuItem disabled={detachDisabled} onSelect={() => onArchive()}>{t("tasks:resources.archive")}</ContextMenuItem>}
        <ContextMenuItem variant="destructive" disabled={detachDisabled} onSelect={() => { setError(null); setOpen(true); }}>{t(mode === "delete" ? "tasks:resources.deleteAttachment" : "tasks:context.detach")}</ContextMenuItem>
        {trailingActions}
      </ContextMenuContent>
    </ContextMenu>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}><DialogContent>
      <DialogTitle>{t(mode === "delete" ? "tasks:resources.deleteAttachmentTitle" : "tasks:context.detachTitle")}</DialogTitle>
      <DialogDescription>{t(mode === "delete" ? "tasks:resources.deleteAttachmentDescription" : "tasks:context.detachDescription")}</DialogDescription>
      {error !== null && <p role="alert" className="text-xs text-destructive">{getTaskError(error)}</p>}
      <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)} autoFocus>{t("common:actions.cancel")}</Button>
        <Button variant="destructive" size="sm" disabled={detachDisabled || busy} onClick={() => void detach()}>{t(mode === "delete" ? "tasks:resources.deleteAttachment" : "tasks:context.detach")}</Button></div>
    </DialogContent></Dialog>
  </>;
}
