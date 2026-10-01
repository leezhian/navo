import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ResourceRecord } from "@/shared/settingsTypes";
import { useResourceForm } from "@/hooks/useResourceForm";
import { getSettingsError } from "@/services/settingsErrors";

interface ResourceDialogProps {
  /** 编辑目标；未传入时新增资源。 */
  record?: ResourceRecord;
  /** 新增入口的类型，拖入目录会切换到本地文件夹模式。 */
  initialKind: ResourceRecord["kind"];
  /** 默认克隆父目录，绝不会覆盖已存在的目标目录。 */
  repositoriesDirectory: string;
  /** 关闭后卸载表单，清理本次进度监听。 */
  onClose: () => void;
}

export function ResourceDialog({ record, initialKind, repositoriesDirectory, onClose }: ResourceDialogProps) {
  const { t } = useTranslation();
  const form = useResourceForm({ record, initialKind, repositoriesDirectory, onSaved: onClose });
  const title = record ? "编辑资源" : form.isClone ? "添加仓库" : "添加文件夹";
  const disabled = form.busy || form.choosing;

  return <Dialog open onOpenChange={(open) => { if (!open && !disabled) onClose(); }}>
    <DialogContent className="sm:max-w-lg" showCloseButton={!disabled} onEscapeKeyDown={(event) => { if (disabled) event.preventDefault(); }} onInteractOutside={(event) => { if (disabled) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{t(title)}</DialogTitle><DialogDescription className="text-xs leading-5">{t(record ? "修改名称或本地路径不会更改 Git remote。" : form.isClone ? "支持 HTTPS / SSH，使用系统 Git 现有认证。" : "拖入目录，或选择已有本地文件夹；不会执行克隆。")}</DialogDescription></DialogHeader>
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void form.submit(); }}>
        {form.isClone && <label className="grid gap-2 text-xs">{t("仓库地址")}<Input autoFocus disabled={disabled} placeholder="https://github.com/team/repo.git" value={form.url} onChange={(event) => form.setUrl(event.target.value)} required /></label>}
        <label className="grid gap-2 text-xs">{t("名称")}<Input autoFocus={!form.isClone} disabled={disabled} value={form.name} maxLength={100} onChange={(event) => form.setName(event.target.value)} required /></label>
        <label className="grid gap-2 text-xs">{t(form.isClone ? "克隆到" : "本地路径")}
          <div className="flex gap-2"><Input disabled={disabled} value={form.isClone ? form.directory : form.localPath} onChange={(event) => form.isClone ? form.setDirectory(event.target.value) : form.setLocalPath(event.target.value)} required />
            <IconTooltip label={t("选择目录")} variant="secondary" size="icon" disabled={disabled} onClick={() => void form.chooseFolder(form.isClone)}><FolderOpen className="size-4" /></IconTooltip>
          </div>
        </label>
        {!record && <div className="resource-drop-area" data-disabled={disabled} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? "none" : "copy"; }} onDrop={form.handleDrop}>
          <p className="text-xs leading-5 text-muted-foreground">{t("拖入目录，或选择已有本地文件夹；不会执行克隆。")}</p>
          <Button type="button" className="mt-2 h-8 text-xs" variant="secondary" disabled={disabled} onClick={() => void form.chooseFolder()}>{t("选择本地文件夹")}</Button>
        </div>}
        {form.progress && <pre role="status" className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-[11px] leading-5">{form.progress}</pre>}
        {form.error !== null && <p role="alert" className="text-xs leading-5 text-destructive">{getSettingsError(form.error)}</p>}
        <DialogFooter>
          {form.busy && form.isClone ? <Button type="button" variant="secondary" disabled={form.cancelling} onClick={() => void form.cancelClone()}>{t(form.cancelling ? "取消中…" : "取消克隆")}</Button>
            : <Button type="button" variant="ghost" disabled={disabled} onClick={onClose}>{t("取消")}</Button>}
          <Button type="submit" disabled={disabled}>{t(form.busy ? form.isClone ? "克隆中…" : "保存中…" : form.isClone ? "克隆仓库" : record ? "保存" : "添加")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
