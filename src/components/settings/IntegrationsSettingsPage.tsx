import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useIntegrationStore } from "@/stores/integrationStore";
import { SettingsList, SettingsPageHeader, SettingsRow } from "./settingsPrimitives";
import { IntegrationProviderIcon } from "./IntegrationProviderIcon";

export function IntegrationsSettingsPage() {
  const { t } = useTranslation(["common", "settings"]);
  const { providers, loading, refresh } = useIntegrationStore();
  useEffect(() => { void refresh(); }, [refresh]);
  return <>
    <div className="flex items-start justify-between gap-4">
      <SettingsPageHeader title={t("settings:pages.integrations")} />
      <IconTooltip label={t("common:actions.refresh")} size="icon-sm" variant="ghost" disabled={loading} onClick={() => void refresh()}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /></IconTooltip>
    </div>
    <p className="mb-4 text-xs leading-5 text-muted-foreground">{t("settings:integrations.placeholder")}</p>
    <SettingsList>{providers.map((provider) => <SettingsRow key={provider.id} icon={<IntegrationProviderIcon provider={provider.id} />} title={provider.name} description={t("settings:integrations.disconnected")}>
      <Button className="h-8 text-xs" variant="secondary" disabled>{t("settings:integrations.connect")}</Button>
    </SettingsRow>)}</SettingsList>
  </>;
}
