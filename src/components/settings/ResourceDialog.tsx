import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ResourceRecord } from "@/shared/settingsTypes";
import { useResourceForm } from "@/hooks/useResourceForm";
import { getSettingsError } from "@/services/settingsErrors";
import { ResourceDropArea } from "./ResourceDropArea";

interface ResourceDialogProps {
  /** 编辑目标；未传入时新增资源。 */
  record?: ResourceRecord;
  /** 默认克隆父目录，绝不会覆盖已存在的目标目录。 */
  repositoriesDirectory: string;
  /** 关闭后卸载表单，清理本次进度监听。 */
  onClose: () => void;
  /** 作为子弹窗打开时恢复父层入口焦点；独立使用时沿用默认行为。 */
  onReturnFocus?: () => void;
}

export function ResourceDialog({ record, repositoriesDirectory, onClose, onReturnFocus }: ResourceDialogProps) {
  const { t } = useTranslation(["common", "settings"]);
  const form = useResourceForm({ record, repositoriesDirectory, onSaved: onClose });
  const title = record ? "settings:resources.editTitle" : "settings:resources.addRepository";
  const disabled = form.busy || form.choosing;

  return <Dialog open onOpenChange={(open) => { if (!open && !disabled) onClose(); }}>
    <DialogContent className="sm:max-w-lg" aria-describedby="resource-dialog-description" showCloseButton={!disabled} onEscapeKeyDown={(event) => { if (disabled) event.preventDefault(); }} onInteractOutside={(event) => { if (disabled) event.preventDefault(); }}
      onCloseAutoFocus={(event) => { if (onReturnFocus) { event.preventDefault(); onReturnFocus(); } }}>
      <DialogHeader>
        <DialogTitle>{t(title)}</DialogTitle>
        {record && <DialogDescription id="resource-dialog-description" className="text-xs leading-5">{t("settings:resources.editDescription")}</DialogDescription>}
      </DialogHeader>
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void form.submit(); }}>
        {form.isClone && <label className="grid gap-2 text-xs">{t("settings:resources.url")}<Input autoFocus disabled={disabled} placeholder="https://github.com/team/repo.git" value={form.url} onChange={(event) => form.setUrl(event.target.value)} required /></label>}
        {!record && <DialogDescription id="resource-dialog-description" className="text-xs leading-5">{t("settings:resources.cloneHint")}</DialogDescription>}
        {record && <>
          <label className="grid gap-2 text-xs">{t("common:fields.name")}<Input autoFocus disabled={disabled} value={form.name} maxLength={100} onChange={(event) => form.setName(event.target.value)} required /></label>
          <label className="grid gap-2 text-xs">{t("settings:resources.localPath")}
            <div className="flex gap-2"><Input disabled={disabled} value={form.localPath} onChange={(event) => form.setLocalPath(event.target.value)} required />
              <IconTooltip label={t("settings:general.chooseDirectory")} variant="secondary" size="icon" disabled={disabled} onClick={() => void form.chooseFolder()}><FolderOpen className="size-4" /></IconTooltip>
            </div>
          </label>
        </>}
        {!record && <ResourceDropArea disabled={disabled} onChooseFolder={() => void form.chooseFolder()} onDrop={(event) => void form.handleDrop(event)} />}
        {form.progress && <pre role="status" className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-[11px] leading-5">{form.progress}</pre>}
        {form.error !== null && <p role="alert" className="text-xs leading-5 text-destructive">{getSettingsError(form.error)}</p>}
        <DialogFooter>
          {form.busy && form.isClone ? <Button type="button" variant="secondary" disabled={form.cancelling} onClick={() => void form.cancelClone()}>{t(form.cancelling ? "settings:resources.cancelling" : "settings:resources.cancelClone")}</Button>
            : <Button type="button" variant="ghost" disabled={disabled} onClick={onClose}>{t("common:actions.cancel")}</Button>}
          <Button type="submit" disabled={disabled}>{t(form.busy ? form.isClone ? "settings:resources.cloning" : "common:status.saving" : record ? "common:actions.save" : "common:actions.confirm")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
