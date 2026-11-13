import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover } from "radix-ui";
import { Check, ChevronDown, ChevronRight, ChevronsUpDown, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BranchOption } from "@/shared/taskTypes";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useNestedLayerDismiss } from "@/hooks/useNestedLayerDismiss";

interface TaskBranchPickerProps {
  /** 只显示已获取的本地与远程跟踪分支。 */
  branches: BranchOption[];
  /** 完整 ref，避免本地分支名与远程名称相同引起歧义。 */
  value: string;
  /** 仓库实际检出的分支名，空值表示分离 HEAD。 */
  currentBranch: string;
  /** 特殊选项与同名普通源分支区分，只有前者不创建新分支。 */
  useCurrentBranch: boolean;
  /** 创建或查询过程中禁止变更。 */
  disabled: boolean;
  /** 资源选择列表内使用紧凑、低对比触发器，不影响分支选择行为。 */
  compact?: boolean;
  /** 直接使用已有分支时隐藏目标分支；与基于该分支创建新区分。 */
  useExistingBranch?: boolean;
  onUseExistingBranch: (ref: string) => void;
  /** 仅更新草稿，不立即执行 Git 命令。 */
  onChange: (ref: string) => void;
  /** 使用仓库当前工作区，隐藏目标分支且不创建 Worktree。 */
  onUseCurrentBranch: () => void;
}

export function TaskBranchPicker({ branches, value, currentBranch, useCurrentBranch, disabled, compact = false, useExistingBranch = false, onUseExistingBranch, onChange, onUseCurrentBranch }: TaskBranchPickerProps) {
  const { t } = useTranslation(["common", "taskCreate", "review"]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const nestedLayer = useNestedLayerDismiss();
  const visible = branches.filter((branch) => branch.name.toLowerCase().includes(search.trim().toLowerCase()));
  const currentLabel = `${t("taskCreate:branches.useCurrent")} · ${currentBranch || t("taskCreate:branches.detachedHead")}`;
  const branchLabel = branches.find((branch) => branch.ref === value)?.name ?? t("taskCreate:branches.selectSource");
  const label = useCurrentBranch ? currentLabel : useExistingBranch ? t("taskCreate:branches.existingLabel", { branch: branchLabel }) : branchLabel;
  const Chevron = compact ? ChevronDown : ChevronsUpDown;
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild><Button type="button" variant={compact ? "ghost" : "outline"} disabled={disabled}
      className={cn("h-8 max-w-48 justify-start text-xs", compact && "h-7 w-36 max-w-36 border-0 px-2 text-[11px] font-normal text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=open]:bg-background dark:hover:bg-background/70")}
      aria-label={t("taskCreate:branches.source")} title={label}>
      <GitBranch className="size-3.5 shrink-0" /><span className="truncate">{label}</span><Chevron className="ml-auto size-3 shrink-0" />
    </Button></Popover.Trigger>
    <Popover.Portal><Popover.Content ref={nestedLayer.contentRef} onPointerDownOutside={nestedLayer.onPointerDownOutside} align={compact ? "end" : "start"} sideOffset={6} className="z-50 w-72 rounded-xl border bg-popover p-3 text-popover-foreground shadow-md">
      <Input autoFocus aria-label={t("review:branches.search")} placeholder={t("taskCreate:branches.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} className="mb-2 h-8 text-xs" />
      <div className="mb-1 border-b pb-2">
        <Button type="button" variant="ghost" disabled={disabled} aria-label={t("taskCreate:branches.useCurrent")} className="h-8 w-full justify-start text-xs" onClick={() => { onUseCurrentBranch(); setOpen(false); }}>
          <span className="truncate">{currentLabel}</span>{useCurrentBranch && <Check className="ml-auto size-3.5 shrink-0" />}
        </Button>
      </div>
      <div className="max-h-64 overflow-auto">
        {(["local", "remote"] as const).map((kind) => <div key={kind}>
          <p className="px-2 py-2 text-[11px] text-muted-foreground">{t(kind === "local" ? "taskCreate:branches.local" : "taskCreate:branches.remote")}</p>
          {visible.filter((branch) => branch.kind === kind).map((branch) => <div key={branch.ref} className="flex items-center rounded-lg hover:bg-muted">
            <Button type="button" variant="ghost" disabled={disabled} className="h-8 min-w-0 flex-1 justify-start text-xs" onClick={() => { onChange(branch.ref); setOpen(false); }}><span className="truncate">{branch.name}</span>{!useCurrentBranch && branch.ref === value && <Check className="ml-auto size-3.5 shrink-0" />}</Button>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" disabled={disabled} aria-label={t("taskCreate:branches.actions", { branch: branch.name })}><ChevronRight className="size-3" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="right">
                <DropdownMenuItem className="text-xs" onSelect={() => { onUseExistingBranch(branch.ref); setOpen(false); }}>{t("taskCreate:branches.useExisting")}</DropdownMenuItem>
                <DropdownMenuItem className="text-xs" onSelect={() => { onChange(branch.ref); setOpen(false); }}>{t("taskCreate:branches.newFrom")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>)}
        </div>)}
        {!visible.length && <p className="p-2 text-xs text-muted-foreground">{t("taskCreate:branches.noMatches")}</p>}
      </div>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
