import { useState } from "react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import { useTaskStore } from "@/stores/taskStore";
import { useTaskTabsStore } from "@/stores/taskTabsStore";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTaskError } from "@/services/taskErrors";

interface TaskContextMenuProps {
  /** 卡片或列表行作为原始触发节点，不新增影响拖拽的布局包装。 */
  children: ReactElement;
  /** 当前任务状态决定归档/恢复及资源占位入口。 */
  task: Task;
  /** 已有任务标签时直接激活，否则打开独立侧栏详情。 */
  onOpen: () => void;
}

export function TaskContextMenu({ children, task, onOpen }: TaskContextMenuProps) {
  const { t } = useTranslation(["common", "tasks"]);
  const store = useTaskStore();
  const openTask = useTaskTabsStore((state) => state.openTask);
  const [action, setAction] = useState<"rename" | "delete" | null>(null);
  const [title, setTitle] = useState(task.title);
  async function confirm() {
    const success = action === "rename" ? await store.rename(task.id, title) : await store.remove(task.id);
    if (success) setAction(null);
  }
  return <>
    <ContextMenu><ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      {/* 重复右击只更新 Radix 的虚拟锚点，需要持续跟踪其位置变化。 */}
      <ContextMenuContent updatePositionStrategy="always">
        <ContextMenuItem onSelect={onOpen}>{t("common:actions.open")}</ContextMenuItem>
        <ContextMenuItem onSelect={() => { openTask(task.id); onOpen(); }}>{t("tasks:actions.openInTab")}</ContextMenuItem>
        <ContextMenuItem disabled={store.pending} onSelect={() => { setTitle(task.title); setAction("rename"); }}>{t("common:actions.rename")}</ContextMenuItem>
        {/* TODO: 任务创建后的资源增补流程在后续需求中接入。 */}
        {task.status !== "ARCHIVED" && <ContextMenuItem disabled>{t("tasks:actions.addResource")}</ContextMenuItem>}
        <ContextMenuSeparator />
        <ContextMenuItem disabled={store.pending} onSelect={() => { void (task.status === "ARCHIVED" ? store.restore(task.id) : store.move(task.id, "ARCHIVED", null)); }}>{t(task.status === "ARCHIVED" ? "common:actions.restore" : "common:actions.archive")}</ContextMenuItem>
        <ContextMenuItem disabled={store.pending} variant="destructive" onSelect={() => setAction("delete")}>{t("common:actions.delete")}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
    <Dialog open={action !== null} onOpenChange={(open) => { if (!open && !store.pending) setAction(null); }}>
      <DialogContent showCloseButton={!store.pending} onEscapeKeyDown={(event) => { if (store.pending) event.preventDefault(); }} onInteractOutside={(event) => { if (store.pending) event.preventDefault(); }}>
        <DialogHeader><DialogTitle>{t(action === "rename" ? "tasks:dialogs.renameTitle" : "tasks:dialogs.deleteTitle")}</DialogTitle><DialogDescription>{t(action === "rename" ? "tasks:dialogs.renameDescription" : "tasks:dialogs.deleteDescription")}</DialogDescription></DialogHeader>
        {action === "rename" ? <Input autoFocus aria-label={t("tasks:fields.title")} disabled={store.pending} value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && title.trim() && !store.pending) void confirm(); }} /> : <p className="text-sm">{task.title}</p>}
        {store.error !== null && <p role="alert" className="text-xs text-destructive">{getTaskError(store.error)}</p>}
        <DialogFooter><Button variant="ghost" disabled={store.pending} onClick={() => setAction(null)}>{t("common:actions.cancel")}</Button><Button variant={action === "delete" ? "destructive" : "default"} disabled={store.pending || (action === "rename" && !title.trim())} onClick={() => void confirm()}>{t("common:actions.confirm")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
