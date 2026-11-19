import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TaskResourceBatchConfirmDialogProps {
  /** 批量解除关联、删除附件副本或软删除笔记，均需二次确认。 */
  action: "detach" | "delete";
  /** 笔记删除保留正文和历史，不能套用附件物理删除的说明。 */
  notes?: boolean;
  count: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function TaskResourceBatchConfirmDialog({ action, notes, count, busy, onClose, onConfirm }: TaskResourceBatchConfirmDialogProps) {
  const { t } = useTranslation(["tasks", "common"]);
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="sm:max-w-md" data-batch-confirm={action}>
      <DialogTitle>{t(action === "delete" ? notes ? "tasks:resources.deleted.confirmTitle" : "tasks:resources.batch.deleteConfirmTitle" : "tasks:resources.batch.detachConfirmTitle", { count })}</DialogTitle>
      <DialogDescription>{t(action === "delete" ? notes ? "tasks:resources.deleted.confirmDescription" : "tasks:resources.batch.deleteConfirmDescription" : "tasks:resources.batch.detachConfirmDescription")}</DialogDescription>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} autoFocus onClick={onClose}>{t("common:actions.cancel")}</Button>
        <Button variant="destructive" size="sm" disabled={busy || count <= 0} onClick={onConfirm}>{t(action === "delete" ? "tasks:resources.batch.delete" : "tasks:resources.batch.detach")}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
