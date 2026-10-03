import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Folder, GitBranch, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AppSettings } from "@/domain/types";
import type { ResourceRecord } from "@/shared/settingsTypes";
import { useResourceStore } from "@/stores/resourceStore";
import { getSettingsError } from "@/services/settingsErrors";
import { SettingsPageHeader } from "./settingsPrimitives";
import { ResourceDialog } from "./ResourceDialog";

interface ResourcesSettingsPageProps {
  /** 仓库新增表单读取已配置的默认父目录。 */
  settings: AppSettings;
}

export function ResourcesSettingsPage({ settings }: ResourcesSettingsPageProps) {
  const { t } = useTranslation();
  const resources = useResourceStore();
  const [form, setForm] = useState<{ record?: ResourceRecord } | null>(null);
  const [removing, setRemoving] = useState<ResourceRecord | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);
  const [removeError, setRemoveError] = useState<unknown>(null);
  const showEmptyState = resources.loaded && resources.records.length === 0 && resources.error === null;
  useEffect(() => { void resources.refresh(); }, [resources.refresh]);

  async function removeRecord() {
    if (!removing || removingBusy) return;
    setRemovingBusy(true);
    setRemoveError(null);
    try { await resources.remove(removing.id); setRemoving(null); }
    catch (failure) { setRemoveError(failure); }
    finally { setRemovingBusy(false); }
  }

  return <>
    <SettingsPageHeader title={t("仓库与文件夹")} />
    <p className="mb-4 text-xs leading-5 text-muted-foreground">{t("移除记录不会删除磁盘文件。")}</p>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Button className="h-8 text-xs" variant="secondary" onClick={() => setForm({})}><GitBranch className="size-3.5" />{t("添加仓库")}</Button>
      <IconTooltip label={t("刷新")} className="ml-auto" size="icon-sm" variant="ghost" disabled={resources.loading} onClick={() => void resources.refresh()}><RefreshCw className={resources.loading ? "size-4 animate-spin" : "size-4"} /></IconTooltip>
    </div>
    {resources.error !== null && <p role="alert" className="mb-3 text-xs text-destructive">{getSettingsError(resources.error)}</p>}
    {showEmptyState && <p className="ade-empty-state">{t("暂无仓库或文件夹")}</p>}
    <div className="settings-list" aria-busy={resources.loading}>
      {resources.records.map((record) => <div key={record.id} className="resource-row">
        {record.kind === "repo" ? <GitBranch className="mt-1 size-4 shrink-0 text-muted-foreground" /> : <Folder className="mt-1 size-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1"><h2 className="truncate text-[13px]">{record.name}</h2><p className="mt-1 break-all text-xs text-muted-foreground">{record.localPath}</p>
          {record.kind === "repo" && <p className="mt-1 text-xs text-muted-foreground">{t("仓库")}</p>}
          {!record.available && <p className="mt-1 text-xs text-destructive">{t("路径不可用")}</p>}
        </div>
        <IconTooltip label={t("编辑") + ": " + record.name} variant="ghost" size="icon-sm" onClick={() => setForm({ record })}><Pencil className="size-3.5" /></IconTooltip>
        <IconTooltip label={t("移除") + ": " + record.name} variant="ghost" size="icon-sm" onClick={() => { setRemoveError(null); setRemoving(record); }}><Trash2 className="size-3.5" /></IconTooltip>
      </div>)}
    </div>
    {form && <ResourceDialog record={form.record} repositoriesDirectory={settings.repositoriesDirectory} onClose={() => setForm(null)} />}
    <Dialog open={Boolean(removing)} onOpenChange={(open) => { if (!open && !removingBusy) setRemoving(null); }}>
      <DialogContent showCloseButton={!removingBusy} onInteractOutside={(event) => { if (removingBusy) event.preventDefault(); }}>
        <DialogHeader><DialogTitle>{t("移除资源？")}</DialogTitle><DialogDescription>{t("仅移除 Navo 中的记录，不删除本地目录及文件。")}</DialogDescription></DialogHeader>
        <p className="break-all text-xs">{removing?.localPath}</p>
        {removeError !== null && <p role="alert" className="text-xs text-destructive">{getSettingsError(removeError)}</p>}
        <DialogFooter><Button variant="ghost" disabled={removingBusy} onClick={() => setRemoving(null)}>{t("取消")}</Button><Button variant="destructive" disabled={removingBusy} onClick={() => void removeRecord()}>{t("移除")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
