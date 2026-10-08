import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { ButtonGroup } from "@/components/ui/button-group";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import type { TaskResourceDraft } from "@/domain/taskResourceDraft";
import { TaskResourceSelect } from "./TaskResourceSelect";
import { TaskResourceBranchOptions } from "./TaskResourceBranchOptions";

interface TaskResourceRowProps {
  /** 单个工作目录的草稿，包含探测结果与执行模式。 */
  value: TaskResourceDraft;
  /** 保存与资源选择期间禁用冲突操作。 */
  disabled: boolean;
  /** 更新当前资源的草稿配置。 */
  onChange: (value: TaskResourceDraft) => void;
  /** 其他行已经关联的资源在下拉列表中禁用。 */
  excludedIds: string[];
  /** 下拉选择后探测并替换资源，重置源分支和目标分支。 */
  onReplace: (id: string) => Promise<void>;
  /** 仅移出草稿，不删除全局资源记录。 */
  onRemove: () => void;
}

export function TaskResourceRow({ value, disabled, excludedIds, onChange, onReplace, onRemove }: TaskResourceRowProps) {
  const { t } = useTranslation(["common", "taskCreate"]);
  return <ButtonGroup className="w-max" aria-label={value.info.name}>
    <TaskResourceSelect value={value.info} excludedIds={excludedIds} disabled={disabled} onSelect={onReplace} />
    <TaskResourceBranchOptions value={value} disabled={disabled} onChange={onChange} />
    <IconTooltip label={t("common:selection.removeItem", { title: value.info.name })} disabled={disabled} variant="outline" size="icon" onClick={onRemove}><X className="size-3.5" /></IconTooltip>
  </ButtonGroup>;
}
