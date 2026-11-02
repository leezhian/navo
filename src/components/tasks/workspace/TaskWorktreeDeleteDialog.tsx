import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import type { TaskResource } from "@/shared/taskTypes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTaskWorktreeDeletion } from "@/hooks/useTaskWorktreeDeletion";
import { getTaskError } from "@/services/taskErrors";
import { TaskDeletionResources } from "../TaskDeletionResources";

interface TaskWorktreeDeleteDialogProps {
  /** 只清理所选工作区，保留当前任务及 Git 分支。 */
  task: Task;
  resource: TaskResource;
  /** 取消或删除成功后关闭；执行中不可关闭。 */
  onClose: () => void;
}
export function TaskWorktreeDeleteDialog({ task, resource, onClose }: TaskWorktreeDeleteDialogProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const deletion = useTaskWorktreeDeletion(task.id, resource.resourceId, onClose);
  const cancel = useRef<HTMLButtonElement>(null);
  return <Dialog open onOpenChange={(open) => { if (!open && !deletion.pending) onClose(); }}><DialogContent className="sm:max-w-[480px]" showCloseButton={!deletion.pending}
    onOpenAutoFocus={(event) => { event.preventDefault(); cancel.current?.focus(); }}
    onEscapeKeyDown={(event) => { if (deletion.pending) event.preventDefault(); }} onInteractOutside={(event) => { if (deletion.pending) event.preventDefault(); }}>
    <DialogHeader><DialogTitle>{t("tasks:changesMenu.deleteTitle")}</DialogTitle><DialogDescription className="text-xs leading-5">{t("tasks:changesMenu.deleteDescription")}</DialogDescription></DialogHeader>
    <div className="max-h-[55vh] space-y-3 overflow-y-auto">
      <p className="break-all text-xs text-muted-foreground">{resource.workingPath}</p>
      {deletion.loading && <p role="status" className="text-xs text-muted-foreground">{t("tasks:deletion.checking")}</p>}
      {deletion.preview && <TaskDeletionResources items={[deletion.preview.item]} />}
      {deletion.error !== null && <p role="alert" className="text-xs text-destructive">{getTaskError(deletion.error)}</p>}
      {!deletion.loading && (!deletion.preview || deletion.preview.blocked) && <Button variant="ghost" size="sm" onClick={deletion.refresh}>{t("common:actions.retry")}</Button>}
    </div>
    <DialogFooter><Button ref={cancel} variant="ghost" disabled={deletion.pending} onClick={onClose}>{t("common:actions.cancel")}</Button>
      <Button variant="destructive" disabled={deletion.pending || deletion.loading || !deletion.preview || deletion.preview.blocked || task.status === "ARCHIVED"} onClick={() => void deletion.confirm()}>{t(deletion.pending ? "tasks:deletion.deleting" : "tasks:changesMenu.deleteWorktree")}</Button>
    </DialogFooter>
  </DialogContent></Dialog>;
}
