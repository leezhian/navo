import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResourceDialog } from "@/components/settings/ResourceDialog";
import { useResourceStore } from "@/stores/resourceStore";
import type { useTaskResourceSelection } from "@/hooks/useTaskResourceSelection";
import { getTaskError } from "@/services/taskErrors";
import { TaskResourcePickerRow } from "./TaskResourcePickerRow";

interface TaskResourcePickerContentProps {
  /** 创建草稿及已有任务均排除已关联资源。 */
  excludedIds: string[];
  repositoriesDirectory: string;
  /** 由宿主持有选中及分支配置，切换分类时保留。 */
  selection: ReturnType<typeof useTaskResourceSelection>;
  disabled: boolean;
  /** 嵌套新增仓库弹窗的状态交给父层，防止连带关闭。 */
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
}

export function TaskResourcePickerContent({ excludedIds, repositoriesDirectory, selection, disabled, adding, onAddingChange }: TaskResourcePickerContentProps) {
  const { t } = useTranslation(["taskCreate", "settings", "common"]);
  const resources = useResourceStore();
  const [keyword, setKeyword] = useState("");
  const addButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { void resources.refresh(); }, [resources.refresh]);
  const visible = resources.records.filter((record) => (record.name + " " + record.localPath).toLowerCase().includes(keyword.trim().toLowerCase()));
  return <>
    <div className="flex gap-2"><Input autoFocus className="text-xs" disabled={disabled} aria-label={t("taskCreate:resources.search")} placeholder={t("settings:resources.searchPlaceholder")} value={keyword} onChange={(event) => setKeyword(event.target.value)} />
      <Button ref={addButtonRef} className="text-xs" variant="secondary" disabled={disabled} onClick={() => onAddingChange(true)}><Plus className="size-3.5" />{t("settings:resources.addRepository")}</Button></div>
    <div className="max-h-[50vh] min-h-40 space-y-1 overflow-auto" aria-busy={resources.loading || disabled || selection.pending}>
      {visible.map((record) => {
        const selected = selection.selections.find((item) => item.resourceId === record.id);
        return <TaskResourcePickerRow key={record.id} record={record} selected={Boolean(selected)} draft={selected?.draft}
          disabled={disabled || !record.available || excludedIds.includes(record.id)} onSelect={(checked) => selection.select(record.id, checked)} onChange={selection.update} />;
      })}
      {resources.loaded && resources.error === null && !visible.length && <p className="p-4 text-xs text-muted-foreground">{t("settings:resources.empty")}</p>}
    </div>
    {(selection.error !== null || resources.error !== null) && <p role="alert" className="text-xs text-destructive">{getTaskError(selection.error ?? resources.error)}</p>}
    {adding && <ResourceDialog repositoriesDirectory={repositoriesDirectory} onClose={() => onAddingChange(false)} onReturnFocus={() => addButtonRef.current?.focus()}
      onSaved={(record) => { if (record.available && !excludedIds.includes(record.id)) { selection.select(record.id, true); setKeyword(""); } }} />}
  </>;
}
