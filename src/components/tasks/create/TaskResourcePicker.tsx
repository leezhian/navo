import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Folder, GitBranch, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ResourceDialog } from "@/components/settings/ResourceDialog";
import { useResourceStore } from "@/stores/resourceStore";
import { getTaskError } from "@/services/taskErrors";

interface TaskResourcePickerProps {
  /** 已使用的资源不可重复选择。 */
  excludedIds: string[];
  /** 快捷添加复用设置中的默认克隆位置。 */
  repositoriesDirectory: string;
  /** 完成实际 Git 探测后才关闭选择器；失败保留选择。 */
  onConfirm: (ids: string[]) => Promise<void>;
  /** 取消不改变任务草稿，已快捷添加的全局资源仍保留。 */
  onClose: () => void;
  /** 关闭选择器后将焦点交还创建弹窗中的入口。 */
  onReturnFocus: () => void;
}

export function TaskResourcePicker({ excludedIds, repositoriesDirectory, onConfirm, onClose, onReturnFocus }: TaskResourcePickerProps) {
  const { t } = useTranslation(["common", "taskCreate", "settings"]);
  const resources = useResourceStore();
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { void resources.refresh(); }, [resources.refresh]);
  const visible = resources.records.filter((record) => (record.name + " " + record.localPath).toLowerCase().includes(keyword.trim().toLowerCase()));
  async function confirm() {
    setBusy(true); setError(null);
    try { await onConfirm(selected); onClose(); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <>
  <Dialog open onOpenChange={(open) => { if (!open && !busy && !adding) onClose(); }}>
    <DialogContent className="sm:max-w-[680px]" showCloseButton={!busy} onEscapeKeyDown={(event) => { if (busy || adding) event.preventDefault(); }} onInteractOutside={(event) => { if (busy || adding) event.preventDefault(); }}
      onCloseAutoFocus={(event) => { event.preventDefault(); onReturnFocus(); }}>
      <DialogHeader><DialogTitle>{t("taskCreate:resources.pickerTitle")}</DialogTitle><DialogDescription>{t("taskCreate:resources.sharedDescription")}</DialogDescription></DialogHeader>
      <div className="flex gap-2"><Input autoFocus aria-label={t("taskCreate:resources.search")} placeholder={t("settings:resources.searchPlaceholder")} value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        <Button ref={addButtonRef} variant="secondary" disabled={busy} onClick={() => setAdding(true)}><Plus className="size-3.5" />{t("settings:resources.addRepository")}</Button></div>
      <div className="max-h-[50vh] min-h-40 overflow-auto" aria-busy={resources.loading || busy}>
        {visible.map((record) => {
          const disabled = busy || !record.available || excludedIds.includes(record.id);
          const Icon = record.kind === "repo" ? GitBranch : Folder;
          return <label key={record.id} className="flex cursor-default items-center gap-3 rounded-lg px-2 py-3 hover:bg-muted/40">
            <Checkbox disabled={disabled} checked={selected.includes(record.id)} onCheckedChange={(checked) => setSelected((current) => checked ? [...current, record.id] : current.filter((id) => id !== record.id))} />
            <Icon className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate text-xs">{record.name}</span><span className="mt-1 block truncate text-xs text-muted-foreground" title={record.localPath}>{record.localPath}</span></span>
            {!record.available && <span className="text-xs text-destructive">{t("settings:resources.unavailable")}</span>}
          </label>;
        })}
        {resources.loaded && resources.error === null && visible.length === 0 && <p className="p-4 text-xs text-muted-foreground">{t("settings:resources.empty")}</p>}
      </div>
      {(error !== null || resources.error !== null) && <p role="alert" className="text-xs text-destructive">{getTaskError(error ?? resources.error)}</p>}
      <DialogFooter><Button variant="ghost" disabled={busy} onClick={onClose}>{t("common:actions.cancel")}</Button><Button disabled={busy || selected.length === 0} onClick={() => void confirm()}>{t(busy ? "common:status.checkingProgress" : "common:actions.confirm")}</Button></DialogFooter>
      {adding && <ResourceDialog repositoriesDirectory={repositoriesDirectory} onClose={() => setAdding(false)} onReturnFocus={() => addButtonRef.current?.focus()} />}
    </DialogContent>
  </Dialog>
  </>;
}
