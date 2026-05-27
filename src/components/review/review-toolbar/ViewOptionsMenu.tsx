import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AppSettings } from "@/domain/types";
import { Settings2 } from "lucide-react";
import { updateWrapDiffLines } from "./settingsActions";
import { useDropdownTooltip } from "./useDropdownTooltip";

interface ViewOptionsMenuProps {
  isAllCollapsed: boolean;
  settings: AppSettings;
  onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
  onToggleAllCollapsed: () => void;
}

export function ViewOptionsMenu({
  isAllCollapsed,
  settings,
  onSettingsChange,
  onToggleAllCollapsed,
}: ViewOptionsMenuProps) {
  const tooltip = useDropdownTooltip();

  return (
    <DropdownMenu onOpenChange={tooltip.handleMenuOpenChange}>
      <Tooltip open={tooltip.isTooltipOpen} onOpenChange={tooltip.handleTooltipOpenChange}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              className="text-muted-foreground hover:text-foreground"
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Settings2 className="size-[17px]" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">查看选项</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onSelect={() => updateWrapDiffLines(onSettingsChange)}>
          {settings.wrapDiffLines ? "关闭差异换行" : "开启差异换行"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggleAllCollapsed}>
          {isAllCollapsed ? "全部展开" : "折叠全部"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
