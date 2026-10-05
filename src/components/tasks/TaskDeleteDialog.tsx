import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import type { Task } from "@/domain/tasks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTaskDeletion } from "@/hooks/useTaskDeletion";
import { getTaskError } from "@/services/taskErrors";
import { TaskDeletionResources } from "./TaskDeletionResources";

interface TaskDeleteDialogProps {
  /** 待删除任务；正文显示真实名称，不显示虚构会话数据。 */
  task: Task;
  /** 取消或成功删除后关闭；执行期间不调用。 */
  onClose: () => void;
}

export function TaskDeleteDialog({ task, onClose }: TaskDeleteDialogProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const deletion = useTaskDeletion(task.id, onClose);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { options, preview, pending, loading } = deletion;
  const hasManagedWorktrees = preview ? preview.canDeleteWorktrees : task.resources?.some((resource) => resource.mode === "worktree" && resource.ownership);
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <DialogContent className="sm:max-w-[480px]" showCloseButton={!pending}
      onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus(); }}
      onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}
      onInteractOutside={(event) => { if (pending) event.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>{t("tasks:dialogs.deleteTitle")}</DialogTitle>
        <DialogDescription className="break-words text-xs leading-5">{t("tasks:deletion.description", { title: task.title })}</DialogDescription>
      </DialogHeader>
      <div className="max-h-[55vh] space-y-4 overflow-y-auto">
        {!!task.resources?.length && <p className="text-xs text-muted-foreground">{t(hasManagedWorktrees ? "tasks:deletion.keepByDefault" : "tasks:deletion.keepExisting")}</p>}
        <p className="flex items-center gap-2 text-xs text-destructive"><AlertTriangle aria-hidden="true" className="size-3.5" />{t("tasks:deletion.irreversible")}</p>
        {hasManagedWorktrees && <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs"><Checkbox checked={options.deleteWorktrees} disabled={pending}
            onCheckedChange={(checked) => deletion.changeOptions({ deleteWorktrees: checked === true, deleteBranches: false })} />{t("tasks:deletion.deleteWorktrees")}</label>
          {options.deleteWorktrees && <label className="ml-6 flex items-center gap-2 text-xs"><Checkbox checked={options.deleteBranches} disabled={pending}
            onCheckedChange={(checked) => deletion.changeOptions({ deleteWorktrees: true, deleteBranches: checked === true })} />{t("tasks:deletion.deleteBranches")}</label>}
        </div>}
        {loading && <p role="status" className="text-xs text-muted-foreground">{t("tasks:deletion.checking")}</p>}
        {!loading && preview && (options.deleteWorktrees || preview.items.some((item) => item.worktreeAction === "removed")) && <TaskDeletionResources items={preview.items} />}
        {options.deleteBranches && <p className="text-xs leading-5 text-muted-foreground">{t("tasks:deletion.localRefs")}</p>}
        {deletion.error !== null && <p role="alert" className="text-xs leading-5 text-destructive">{getTaskError(deletion.error)}</p>}
        {!loading && (!preview || preview.blocked) && <Button variant="ghost" size="sm" onClick={deletion.refresh}>{t("common:actions.retry")}</Button>}
      </div>
      <DialogFooter>
        <Button ref={cancelRef} variant="ghost" disabled={pending} onClick={onClose}>{t("common:actions.cancel")}</Button>
        <Button variant="destructive" disabled={pending || loading || !preview || preview.blocked} onClick={() => void deletion.confirm()}>
          {t(pending ? "tasks:deletion.deleting" : "tasks:deletion.confirm")}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
