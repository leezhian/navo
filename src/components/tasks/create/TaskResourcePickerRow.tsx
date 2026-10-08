import { Folder, FolderGit2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { ButtonGroup } from "@/components/ui/button-group";
import type { ResourceRecord } from "@/shared/settingsTypes";
import type { TaskResourceDraft } from "@/domain/taskResourceDraft";
import { TaskResourceBranchOptions } from "./TaskResourceBranchOptions";

interface TaskResourcePickerRowProps {
  /** 全局资源的名称、路径和可用状态。 */
  record: ResourceRecord;
  /** 查询期间仍显示勾选状态，不用配置是否就绪来推断。 */
  selected: boolean;
  /** Git 探测完成后才显示配置，普通目录不显示分支控件。 */
  draft?: TaskResourceDraft | null;
  disabled: boolean;
  /** 仅资源名称区域切换选中，右侧配置操作互不干扰。 */
  onSelect: (selected: boolean) => void;
  /** 修改选择器内的临时配置，确认后才带回任务表单。 */
  onChange: (draft: TaskResourceDraft) => void;
}

export function TaskResourcePickerRow({ record, selected, draft, disabled, onSelect, onChange }: TaskResourcePickerRowProps) {
  const { t } = useTranslation(["settings", "common"]);
  const Icon = record.kind === "repo" ? FolderGit2 : Folder;
  return <div data-resource-id={record.id} data-selected={selected}
    className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3 py-2 transition-colors hover:bg-muted/40 data-[selected=true]:bg-muted/30">
    <label className="flex min-w-36 flex-1 cursor-default items-center gap-2.5">
      <Checkbox disabled={disabled} checked={selected} onCheckedChange={(checked) => onSelect(checked === true)} />
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground"><Icon className="size-3.5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium leading-5" title={record.name}>{record.name}</span>
        <span className="block truncate text-[10px] leading-4 text-muted-foreground" title={record.localPath}>{record.localPath}</span>
      </span>
    </label>
    {draft?.info.git && <ButtonGroup className="ml-auto shrink-0 rounded-lg bg-muted/70 p-0.5" aria-label={record.name}>
      <TaskResourceBranchOptions value={draft} disabled={disabled} onChange={onChange} showTargetBranch={false} />
    </ButtonGroup>}
    {!record.available && <span className="text-xs text-destructive">{t("settings:resources.unavailable")}</span>}
  </div>;
}
