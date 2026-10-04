import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRefreshCooldown } from "@/hooks/useRefreshCooldown";

interface WorkspaceRefreshButtonProps {
  /** 重新读取当前页面数据，不重载窗口或重置视图。 */
  onRefresh: () => void | Promise<void>;
  /** 初始化或数据写入期间禁止刷新，避免并发覆盖。 */
  disabled?: boolean;
}

export function WorkspaceRefreshButton({ onRefresh, disabled = false }: WorkspaceRefreshButtonProps) {
  const { t: translate } = useTranslation();
  const refresh = useRefreshCooldown(onRefresh, disabled);
  let tooltip = translate("刷新");
  if (refresh.refreshing) tooltip = translate("正在刷新");
  else if (refresh.remainingSeconds > 0) {
    tooltip = translate("{{seconds}} 秒", { seconds: refresh.remainingSeconds });
  } else if (refresh.failed) tooltip = translate("刷新失败，请重试");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={refresh.disabled ? 0 : undefined}
          aria-label={refresh.disabled ? tooltip : undefined}>
          <Button aria-label={translate("刷新")} aria-busy={refresh.refreshing} disabled={refresh.disabled}
            className="workspace-toolbar-button" variant="ghost" size="icon" onClick={() => void refresh.refresh()}>
            <RefreshCw aria-hidden="true" className={refresh.refreshing ? "size-4 motion-safe:animate-spin" : "size-4"} />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
