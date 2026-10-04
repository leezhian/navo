import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import type { TaskResourceDraft } from "@/hooks/useTaskDraft";
import { TaskBranchPicker } from "./TaskBranchPicker";
import { TaskResourceSelect } from "./TaskResourceSelect";
import { TaskTargetBranch } from "./TaskTargetBranch";

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
  const git = value.info.git;
  const useCurrentBranch = value.mode === "current-branch";
  return <ButtonGroup className="w-max" aria-label={value.info.name}>
    <TaskResourceSelect value={value.info} excludedIds={excludedIds} disabled={disabled} onSelect={onReplace} />
    {git && <>
      <TaskBranchPicker branches={git.branches} value={value.sourceBranch} currentBranch={git.currentBranch} useCurrentBranch={useCurrentBranch} disabled={disabled}
        onUseCurrentBranch={() => onChange({ ...value, mode: "current-branch", sourceBranch: git.currentBranch ? `refs/heads/${git.currentBranch}` : "HEAD", targetBranch: "" })}
        onChange={(sourceBranch) => onChange({ ...value, sourceBranch, mode: value.mode === "worktree" ? "worktree" : "new-branch" })} />
      {!useCurrentBranch && <TaskTargetBranch value={value.targetBranch} disabled={disabled} onConfirm={(targetBranch) => onChange({ ...value, targetBranch })} />}
      <ButtonGroupText asChild className="h-8 shrink-0 gap-1.5 border-input bg-background px-2 font-normal text-xs text-muted-foreground dark:bg-input/30">
      <label className="cursor-default">
        <Checkbox disabled={disabled || useCurrentBranch} checked={value.mode === "worktree"}
          onCheckedChange={(checked) => onChange({ ...value, mode: checked === true ? "worktree" : "new-branch" })} />
        {t("taskCreate:branches.worktree")}
      </label>
      </ButtonGroupText>
    </>}
    <IconTooltip label={t("common:selection.removeItem", { title: value.info.name })} disabled={disabled} variant="outline" size="icon" onClick={onRemove}><X className="size-3.5" /></IconTooltip>
  </ButtonGroup>;
}
