import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useIntegrationStore } from "@/stores/integrationStore";
import { SettingsList, SettingsPageHeader, SettingsRow } from "./settingsPrimitives";

export function IntegrationsSettingsPage() {
  const { t } = useTranslation();
  const { providers, loading, refresh } = useIntegrationStore();
  useEffect(() => { void refresh(); }, [refresh]);
  return <>
    <div className="flex items-start justify-between gap-4">
      <SettingsPageHeader title={t("集成")} />
      <IconTooltip label={t("刷新")} size="icon-sm" variant="ghost" disabled={loading} onClick={() => void refresh()}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /></IconTooltip>
    </div>
    <p className="mb-4 text-xs leading-5 text-muted-foreground">{t("集成功能尚未接入，当前状态为占位数据；刷新仅重新加载本地占位状态。")}</p>
    <SettingsList>{providers.map((provider) => <SettingsRow key={provider.id} title={provider.name} description={t("尚未连接")}>
      <Button className="h-8 text-xs" variant="secondary" disabled>{t("连接")}</Button>
    </SettingsRow>)}</SettingsList>
  </>;
}
