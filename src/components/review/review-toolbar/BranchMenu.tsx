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
  branchOptions: string[];
  branchSearch: string;
  settings: AppSettings;
  onSearchChange: (value: string) => void;
  onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export function BranchMenu({
  branchOptions,
  branchSearch,
  settings,
  onSearchChange,
  onSettingsChange,
}: BranchMenuProps) {
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
            placeholder="搜索分支"
            value={branchSearch}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <DropdownMenuLabel>分支</DropdownMenuLabel>
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

function BranchOption({
  active,
  label,
  onSelect,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <GitBranch className="size-4 text-muted-foreground" />
      <span>{label}</span>
      {active && <Check className="ml-auto size-4" />}
    </DropdownMenuItem>
  );
}
