import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AppSettings } from "@/domain/types";
import { Check, ChevronsUpDown, GitBranch, Search } from "lucide-react";
import { updateTargetBranch } from "./settingsActions";
import { useDropdownTooltip } from "./useDropdownTooltip";

interface BranchMenuProps {
  /** 经过搜索过滤后的本地及远端跟踪分支候选项。 */
  branchOptions: string[];
  /** 当前分支搜索关键词，由上层维护以便关闭菜单时清空。 */
  branchSearch: string;
  /** 本地设置，读取并更新目标对比分支。 */
  settings: AppSettings;
  /** 搜索框内容变化时更新关键词。 */
  onSearchChange: (value: string) => void;
  /** 选择分支后写回本地设置。 */
  onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export function BranchMenu({
  branchOptions,
  branchSearch,
  settings,
  onSearchChange,
  onSettingsChange,
}: BranchMenuProps) {
  const { t: translate } = useTranslation(["common", "review"]);
  const tooltip = useDropdownTooltip();

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        tooltip.handleMenuOpenChange(open);
        if (!open) {
          onSearchChange("");
        }
      }}
    >
      <Tooltip open={tooltip.isTooltipOpen} onOpenChange={tooltip.handleTooltipOpenChange}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              className="h-6 gap-1 px-0 text-sm font-normal text-muted-foreground hover:bg-transparent hover:text-foreground aria-expanded:bg-transparent aria-expanded:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0"
              type="button"
              variant="ghost"
            >
              <span>{settings.targetBranch}</span>
              <ChevronsUpDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{settings.targetBranch}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-72 p-2">
        <div className="flex h-8 items-center gap-2 px-2 text-muted-foreground">
          <Search className="size-3.5" />
          <Input
            className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            placeholder={translate("review:branches.search")}
            value={branchSearch}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <DropdownMenuLabel>{translate("review:branches.label")}</DropdownMenuLabel>
        {branchOptions.map((branch) => (
          <BranchOption
            active={settings.targetBranch === branch}
            key={branch}
            label={branch}
            onSelect={() => updateTargetBranch(branch, onSettingsChange)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface BranchOptionProps {
  /** 当前分支是否为已选目标分支。 */
  active: boolean;
  /** 分支名称。 */
  label: string;
  /** 点击分支项时更新目标分支。 */
  onSelect: () => void;
}

function BranchOption({ active, label, onSelect }: BranchOptionProps) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <GitBranch className="size-4 text-muted-foreground" />
      <span>{label}</span>
      {active && <Check className="ml-auto size-4" />}
    </DropdownMenuItem>
  );
}
