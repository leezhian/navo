import { useTranslation } from "react-i18next";
import type { TaskResourceCleanupPlan } from "@/shared/taskResourceLifecycle";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TaskResourceCleanupDialogProps {
  plan: TaskResourceCleanupPlan | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function TaskResourceCleanupDialog({ plan, busy, onClose, onConfirm }: TaskResourceCleanupDialogProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const empty = !plan || (plan.missingFiles.length === 0 && plan.mergedPullRequests.length === 0);
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="sm:max-w-lg" data-cleanup-dialog>
      <DialogTitle>{t("tasks:resources.cleanupTitle")}</DialogTitle>
      <DialogDescription>{t("tasks:resources.cleanupDescription")}</DialogDescription>
      {empty ? <p className="text-xs text-muted-foreground">{t("tasks:resources.cleanupEmpty")}</p> : <div className="space-y-3 text-xs">
        {plan.missingFiles.length > 0 && <section>
          <h4 className="mb-1 font-medium">{t("tasks:resources.cleanupMissing")}</h4>
          <ul className="space-y-0.5 text-muted-foreground">{plan.missingFiles.map((file) => <li key={file.id} className="truncate">{file.name}</li>)}</ul>
        </section>}
        {plan.mergedPullRequests.length > 0 && <section>
          <h4 className="mb-1 font-medium">{t("tasks:resources.cleanupMerged")}</h4>
          <ul className="space-y-0.5 text-muted-foreground">{plan.mergedPullRequests.map((item) => <li key={item.id} className="truncate">{item.title}</li>)}</ul>
        </section>}
      </div>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} autoFocus onClick={onClose}>{t("common:actions.cancel")}</Button>
        <Button size="sm" disabled={busy || empty} onClick={onConfirm}>{t("tasks:resources.cleanupConfirm")}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
