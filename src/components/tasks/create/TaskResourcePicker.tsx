import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getTaskError } from "@/services/taskErrors";
import type { AppSettings } from "@/domain/types";
import type { TaskResourceDraft } from "@/domain/taskResourceDraft";
import { useTaskResourceSelection } from "@/hooks/useTaskResourceSelection";
import { TaskResourcePickerContent } from "./TaskResourcePickerContent";

interface TaskResourcePickerProps {
  /** 已使用的资源不可重复选择。 */
  excludedIds: string[];
  /** 快捷添加复用设置中的默认克隆位置。 */
  repositoriesDirectory: string;
  /** 新勾选的仓库沿用设置页默认执行模式。 */
  defaultTaskMode: AppSettings["defaultTaskMode"];
  /** 将已探测并配置的资源加入任务草稿；失败保留选择。 */
  onConfirm: (resources: TaskResourceDraft[]) => void | Promise<void>;
  /** 取消不改变任务草稿，已快捷添加的全局资源仍保留。 */
  onClose: () => void;
  /** 关闭选择器后将焦点交还创建弹窗中的入口。 */
  onReturnFocus: () => void;
}

export function TaskResourcePicker({ excludedIds, repositoriesDirectory, defaultTaskMode, onConfirm, onClose, onReturnFocus }: TaskResourcePickerProps) {
  const { t } = useTranslation(["common", "taskCreate", "settings"]);
  const selection = useTaskResourceSelection(defaultTaskMode);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const selectedDrafts = selection.selections.flatMap((item) => item.draft ? [item.draft] : []);
  const invalidSelection = selectedDrafts.some((draft) => draft.info.git && draft.mode !== "current-branch" && !draft.sourceBranch);
  const canConfirm = !busy && !selection.pending && !invalidSelection && selectedDrafts.length > 0;
  async function confirm() {
    if (!canConfirm) return;
    setBusy(true); setError(null);
    try { await onConfirm(selectedDrafts); onClose(); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <>
  <Dialog open onOpenChange={(open) => { if (!open && !busy && !adding) onClose(); }}>
    <DialogContent className="sm:max-w-[680px]" aria-describedby={undefined} showCloseButton={!busy} onEscapeKeyDown={(event) => { if (busy || adding) event.preventDefault(); }} onInteractOutside={(event) => { if (busy || adding) event.preventDefault(); }}
      onCloseAutoFocus={(event) => { event.preventDefault(); onReturnFocus(); }}>
      <DialogHeader><DialogTitle>{t("taskCreate:resources.pickerTitle")}</DialogTitle></DialogHeader>
      <TaskResourcePickerContent excludedIds={excludedIds} repositoriesDirectory={repositoriesDirectory} selection={selection} disabled={busy} adding={adding} onAddingChange={setAdding} />
      {error !== null && <p role="alert" className="text-xs text-destructive">{getTaskError(error)}</p>}
      <DialogFooter><Button variant="ghost" disabled={busy} onClick={onClose}>{t("common:actions.cancel")}</Button><Button disabled={!canConfirm} onClick={() => void confirm()}>{t(busy ? "common:status.checkingProgress" : "common:actions.confirm")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
  </>;
}
