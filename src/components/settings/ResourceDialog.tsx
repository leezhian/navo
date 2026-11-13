import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ResourceRecord } from "@/shared/settingsTypes";
import { useResourceForm } from "@/hooks/useResourceForm";
import { getSettingsError } from "@/services/settingsErrors";
import { ResourceDropArea } from "./ResourceDropArea";
import { ResourceEditFields } from "./ResourceEditFields";

interface ResourceDialogProps {
  /** 编辑目标；未传入时新增资源。 */
  record?: ResourceRecord;
  /** 默认克隆父目录，绝不会覆盖已存在的目标目录。 */
  repositoriesDirectory: string;
  /** 关闭后卸载表单，清理本次进度监听。 */
  onClose: () => void;
  /** 作为子弹窗打开时恢复父层入口焦点；独立使用时沿用默认行为。 */
  onReturnFocus?: () => void;
  /** 仅保存成功时回传实际记录；取消和失败不触发。 */
  onSaved?: (record: ResourceRecord) => void;
}

export function ResourceDialog({ record, repositoriesDirectory, onClose, onReturnFocus, onSaved }: ResourceDialogProps) {
  const { t } = useTranslation(["common", "settings"]);
  const form = useResourceForm({ record, repositoriesDirectory, onSaved: (saved) => { onSaved?.(saved); onClose(); } });
  const title = record ? "settings:resources.editTitle" : "settings:resources.addRepository";
  const disabled = form.busy || form.choosing;
  const [commandEditing, setCommandEditing] = useState(false);

  return <Dialog open onOpenChange={(open) => { if (!open && !disabled) onClose(); }}>
    <DialogContent className={record ? "gap-0 sm:max-w-[560px]" : "sm:max-w-lg"} aria-describedby={record ? undefined : "resource-dialog-description"} showCloseButton={!disabled} onEscapeKeyDown={(event) => { if (disabled || (event.target instanceof HTMLElement && event.target.dataset.slot === "resource-name-input")) event.preventDefault(); }} onInteractOutside={(event) => { if (disabled) event.preventDefault(); }}
      onCloseAutoFocus={(event) => { if (onReturnFocus) { event.preventDefault(); onReturnFocus(); } }}>
      <DialogHeader className={record ? "sr-only" : undefined}>
        <DialogTitle>{t(title)}</DialogTitle>
      </DialogHeader>
      <form className="grid min-h-0 gap-4" onSubmit={(event) => { event.preventDefault(); if (!commandEditing) void form.submit(); }}>
        <div className={record ? "grid max-h-[65vh] gap-4 overflow-y-auto p-0.5" : "grid max-h-[60vh] gap-4 overflow-y-auto p-0.5"}>
        {form.isClone && <label className="grid gap-2 text-xs">{t("settings:resources.url")}<Input autoFocus disabled={disabled} placeholder="https://github.com/team/repo.git" value={form.url} onChange={(event) => form.setUrl(event.target.value)} required /></label>}
        {!record && <DialogDescription id="resource-dialog-description" className="text-xs leading-5">{t("settings:resources.cloneHint")}</DialogDescription>}
        {record && <ResourceEditFields form={form} disabled={disabled} onCommandEditingChange={setCommandEditing} />}
        {!record && <ResourceDropArea disabled={disabled} onChooseFolder={() => void form.chooseFolder()} onDrop={(event) => void form.handleDrop(event)} />}
        {form.progress && <pre role="status" className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-[11px] leading-5">{form.progress}</pre>}
        {form.error !== null && <p role="alert" className="text-xs leading-5 text-destructive">{getSettingsError(form.error)}</p>}
        </div>
        <DialogFooter className={record ? "bg-transparent py-3" : undefined}>
          {form.busy && form.isClone ? <Button type="button" variant="secondary" disabled={form.cancelling} onClick={() => void form.cancelClone()}>{t(form.cancelling ? "settings:resources.cancelling" : "settings:resources.cancelClone")}</Button>
            : <Button type="button" variant="ghost" disabled={disabled} onClick={onClose}>{t("common:actions.cancel")}</Button>}
          <Button type="submit" disabled={disabled || commandEditing || form.detecting}>{t(form.busy ? form.isClone ? "settings:resources.cloning" : "common:status.saving" : record ? "common:actions.save" : "common:actions.confirm")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
