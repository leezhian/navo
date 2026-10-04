import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AppSettings } from "@/domain/types";
import { RefreshCw, Settings2, WholeWord, WrapText } from "lucide-react";
import { updateEnableTextDiff, updateWrapDiffLines } from "./settingsActions";
import { useDropdownTooltip } from "./useDropdownTooltip";

interface ViewOptionsMenuProps {
  /** 本地展示设置，读取差异换行与文字差异状态。 */
  settings: AppSettings;
  /** 更新本地展示设置，例如开启或关闭差异换行。 */
  onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
  /** 重新加载当前对比方式的 diff。 */
  onRefresh: () => void;
}

export function ViewOptionsMenu({
  settings,
  onSettingsChange,
  onRefresh,
}: ViewOptionsMenuProps) {
  const { t: translate } = useTranslation(["common", "review"]);
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
              <Settings2 className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{translate("review:display.label")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={onRefresh}>
          <RefreshCw className="size-4 text-muted-foreground" />
          <span>{translate("common:actions.refresh")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => updateWrapDiffLines(onSettingsChange)}>
          <WrapText className="size-4 text-muted-foreground" />
          <span>{settings.wrapDiffLines ? translate("review:diff.disableWrapping") : translate("review:diff.enableWrapping")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => updateEnableTextDiff(onSettingsChange)}>
          <WholeWord className="size-4 text-muted-foreground" />
          <span>{settings.enableTextDiff ? translate("review:diff.disableWordDiff") : translate("review:diff.enableWordDiff")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
