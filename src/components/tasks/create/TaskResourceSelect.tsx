import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover } from "radix-ui";
import { Check, ChevronsUpDown, Folder, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useResourceStore } from "@/stores/resourceStore";
import { getTaskError } from "@/services/taskErrors";
import type { TaskResourceInfo } from "@/shared/taskTypes";

interface TaskResourceSelectProps {
  /** 当前工作目录及探测出的 Git 能力。 */
  value: TaskResourceInfo;
  /** 其他行已选资源不可重复选择。 */
  excludedIds: string[];
  /** 创建或探测期间禁止切换。 */
  disabled: boolean;
  /** 探测成功后替换目录并重置分支；失败保留原目录。 */
  onSelect: (id: string) => Promise<void>;
}

export function TaskResourceSelect({ value, excludedIds, disabled, onSelect }: TaskResourceSelectProps) {
  const { t } = useTranslation(["common", "taskCreate", "settings"]);
  const resources = useResourceStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<unknown>(null);
  const Icon = value.git ? GitBranch : Folder;
  const visible = resources.records.filter((record) => record.name.toLowerCase().includes(search.trim().toLowerCase()));

  function changeOpen(next: boolean) {
    if (disabled) return;
    setOpen(next);
    if (next) {
      setSearch("");
      setError(null);
      void resources.refresh();
    }
  }

  async function select(id: string) {
    if (id === value.resourceId) { setOpen(false); return; }
    setError(null);
    try { await onSelect(id); setOpen(false); }
    catch (failure) { setError(failure); }
  }

  return <Popover.Root open={open} onOpenChange={changeOpen}>
    <Popover.Trigger asChild>
      <Button type="button" variant="outline" disabled={disabled} className="h-8 max-w-48 justify-start px-2 text-xs" aria-label={t("taskCreate:resources.replace")} title={value.name}>
        <Icon className="size-3.5 shrink-0" /><span className="truncate">{value.name}</span><ChevronsUpDown className="ml-auto size-3 shrink-0" />
      </Button>
    </Popover.Trigger>
    <Popover.Portal><Popover.Content align="start" sideOffset={6} aria-label={t("taskCreate:resources.replace")} className="z-50 w-72 rounded-xl border bg-popover p-3 text-popover-foreground shadow-md">
      <Input autoFocus aria-label={t("taskCreate:resources.search")} placeholder={t("taskCreate:resources.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} className="mb-2 h-8 text-xs" />
      <div className="max-h-64 overflow-auto" aria-busy={resources.loading || disabled}>
        {visible.map((record) => <Button key={record.id} type="button" variant="ghost" className="h-8 w-full justify-start text-xs"
          disabled={disabled || !record.available || excludedIds.includes(record.id)} onClick={() => void select(record.id)}>
          <span className="truncate">{record.name}</span>
          {!record.available && <span className="ml-auto shrink-0 text-muted-foreground">{t("settings:resources.unavailable")}</span>}
          {record.id === value.resourceId && <Check className="ml-auto size-3.5 shrink-0" />}
        </Button>)}
        {resources.loaded && resources.error === null && !visible.length && <p className="p-2 text-xs text-muted-foreground">{t("settings:resources.empty")}</p>}
      </div>
      {(error !== null || resources.error !== null) && <p role="alert" className="mt-2 text-xs text-destructive">{getTaskError(error ?? resources.error)}</p>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
