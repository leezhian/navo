import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { ButtonGroupSeparator, ButtonGroupText } from "@/components/ui/button-group";
import { cn } from "@/lib/utils";
import type { TaskResourceDraft } from "@/domain/taskResourceDraft";
import { TaskBranchPicker } from "./TaskBranchPicker";
import { TaskTargetBranch } from "./TaskTargetBranch";

interface TaskResourceBranchOptionsProps {
  /** 已完成 Git 探测的当前资源配置。 */
  value: TaskResourceDraft;
  disabled: boolean;
  /** 只修改草稿，不切换仓库实际分支。 */
  onChange: (value: TaskResourceDraft) => void;
  /** 选择器仅展示源分支与隔离选项；创建表单还可编辑目标分支。 */
  showTargetBranch?: boolean;
}

export function TaskResourceBranchOptions({ value, disabled, onChange, showTargetBranch = true }: TaskResourceBranchOptionsProps) {
  const { t } = useTranslation(["common", "taskCreate"]);
  const git = value.info.git;
  if (!git) return null;
  const useCurrentBranch = value.mode === "current-branch";
  const existingWorktree = (ref: string) => git.worktrees?.find((worktree) => worktree.branch === ref.replace(/^refs\/heads\//, "").replace(/^refs\/remotes\/[^/]+\//, ""));
  const lockedWorktree = value.useExistingBranch ? existingWorktree(value.sourceBranch) : undefined;
  const sourceBranch = <TaskBranchPicker branches={git.branches} value={value.sourceBranch} currentBranch={git.currentBranch} useCurrentBranch={useCurrentBranch} useExistingBranch={value.useExistingBranch} disabled={disabled} compact={!showTargetBranch}
      onUseCurrentBranch={() => onChange({ ...value, useExistingBranch: false, mode: "current-branch", sourceBranch: git.currentBranch ? `refs/heads/${git.currentBranch}` : "HEAD", targetBranch: "" })}
      onUseExistingBranch={(sourceBranch) => { const checkout = existingWorktree(sourceBranch); onChange({ ...value, sourceBranch, targetBranch: "", useExistingBranch: true,
        mode: checkout ? checkout.isMain ? "new-branch" : "worktree" : value.mode === "worktree" ? "worktree" : "new-branch" }); }}
      onChange={(sourceBranch) => onChange({ ...value, sourceBranch, useExistingBranch: false, mode: value.mode === "worktree" ? "worktree" : "new-branch" })} />;
  const worktree = <ButtonGroupText asChild className={cn("h-8 shrink-0 gap-1.5 border-input bg-background px-2 font-normal text-xs text-muted-foreground dark:bg-input/30",
    !showTargetBranch && "h-7 border-0 bg-transparent text-[11px] transition-colors hover:bg-background/70 has-disabled:pointer-events-none has-disabled:opacity-50 dark:bg-transparent")}>
      <label className="cursor-default">
        <Checkbox className={showTargetBranch ? undefined : "size-3.5"} disabled={disabled || useCurrentBranch || Boolean(lockedWorktree)} checked={lockedWorktree ? !lockedWorktree.isMain : value.mode === "worktree"}
          onCheckedChange={(checked) => onChange({ ...value, mode: checked === true ? "worktree" : "new-branch" })} />
        {t("taskCreate:branches.worktree")}
      </label>
    </ButtonGroupText>;
  if (!showTargetBranch) return <>{worktree}<ButtonGroupSeparator className="bg-border/60" />{sourceBranch}</>;
  return <>
    {sourceBranch}
    {!useCurrentBranch && !value.useExistingBranch && <TaskTargetBranch value={value.targetBranch} disabled={disabled} onConfirm={(targetBranch) => onChange({ ...value, targetBranch })} />}
    {worktree}
  </>;
}
