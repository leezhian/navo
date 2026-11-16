import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { INTEGRATION_PROVIDERS } from "@/shared/integrationTypes";
import type { IntegrationProviderId } from "@/shared/integrationTypes";
import { IntegrationProviderIcon } from "@/components/settings/IntegrationProviderIcon";
import { useSettingsNavigationStore } from "@/stores/settingsNavigationStore";
import { useAppNavigation } from "@/hooks/useAppNavigation";

interface IssueEmptyStateProps {
  /** 原始数据存在但被筛选隐藏时，只展示无匹配提示。 */
  hasItems: boolean;
  /** 是否已连接任意平台；未连接时展示引导。 */
  hasConnections: boolean;
}

export function IssueEmptyState({ hasItems, hasConnections }: IssueEmptyStateProps) {
  const { t } = useTranslation(["common", "issues", "settings"]);
  const openIntegrations = useSettingsNavigationStore((state) => state.openIntegrations);
  const selectSection = useAppNavigation().selectSection;

  if (hasItems) {
    return <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6" role="status">
      <div className="max-w-md text-center"><p className="text-sm font-medium">{t("issues:empty.matches")}</p></div>
    </div>;
  }

  if (!hasConnections) {
    return <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6" role="status">
      <div className="max-w-lg text-center">
        <p className="text-sm font-medium">{t("issues:empty.connectTitle")}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("issues:empty.connectDescription")}</p>
        <div className="mt-4 flex flex-col gap-2">
          {INTEGRATION_PROVIDERS.map((provider) => (
            <div key={provider.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left">
              <span className="flex min-w-0 items-center gap-2 text-xs">
                <IntegrationProviderIcon provider={provider.id as IntegrationProviderId} />
                <span className="truncate">{provider.name}</span>
              </span>
              <Button className="h-7 text-xs" variant="secondary" onClick={() => {
                openIntegrations(provider.id);
                selectSection("settings");
              }}>{t("settings:integrations.connect")}</Button>
            </div>
          ))}
        </div>
      </div>
    </div>;
  }

  return <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6" role="status">
    <div className="max-w-md text-center">
      <p className="text-sm font-medium">{t("issues:empty.assignedTitle")}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("issues:empty.assignedDescription")}</p>
    </div>
  </div>;
}
