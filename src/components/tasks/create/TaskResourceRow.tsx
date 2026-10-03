import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import type { TaskResourceDraft } from "@/hooks/useTaskDraft";
import { TaskBranchPicker } from "./TaskBranchPicker";
import { TaskResourceSelect } from "./TaskResourceSelect";

interface TaskResourceRowProps {
  /** 单个工作目录的草稿，包含探测结果与执行模式。 */
  value: TaskResourceDraft;
  /** 留空目标分支时仅提示当前前缀，最终名称在主进程生成。 */
  branchPrefix: string;
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

export function TaskResourceRow({ value, branchPrefix, disabled, excludedIds, onChange, onReplace, onRemove }: TaskResourceRowProps) {
  const { t } = useTranslation();
  const git = value.info.git;
  const useCurrentBranch = value.mode === "current-branch";
  return <div className="flex min-w-[620px] items-center gap-1.5 rounded-lg bg-muted/35 p-1">
    <div className="min-w-0 flex-1">
      <TaskResourceSelect value={value.info} excludedIds={excludedIds} disabled={disabled} onSelect={onReplace} />
    </div>
    {git && <>
      <div className="min-w-0 flex-1">
        <TaskBranchPicker branches={git.branches} value={value.sourceBranch} currentBranch={git.currentBranch} useCurrentBranch={useCurrentBranch} disabled={disabled}
          onUseCurrentBranch={() => onChange({ ...value, mode: "current-branch", sourceBranch: git.currentBranch ? `refs/heads/${git.currentBranch}` : "HEAD", targetBranch: "" })}
          onChange={(sourceBranch) => onChange({ ...value, sourceBranch, mode: value.mode === "worktree" ? "worktree" : "new-branch" })} />
      </div>
      {!useCurrentBranch && <Input className="h-8 min-w-0 flex-[1.2] font-mono text-xs" aria-label={t("目标分支")} disabled={disabled} value={value.targetBranch} placeholder={t("留空自动生成：{{prefix}}xxxxxxxx", { prefix: branchPrefix })} onChange={(event) => onChange({ ...value, targetBranch: event.target.value })} />}
      <label className="flex shrink-0 cursor-default items-center gap-1.5 px-2 text-xs text-muted-foreground">
        <Checkbox disabled={disabled || useCurrentBranch} checked={value.mode === "worktree"}
          onCheckedChange={(checked) => onChange({ ...value, mode: checked === true ? "worktree" : "new-branch" })} />
        {t("独立 Worktree")}
      </label>
    </>}
    <IconTooltip label={t("移除：{{title}}", { title: value.info.name })} disabled={disabled} variant="ghost" size="icon-sm" onClick={onRemove}><X className="size-3.5" /></IconTooltip>
  </div>;
}
