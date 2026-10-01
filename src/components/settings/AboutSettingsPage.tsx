import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SettingsList, SettingsPageHeader, SettingsRow, SettingsSectionHeader } from "./settingsPrimitives";
import type { AppInfo, CheckForUpdatesResult, ExternalLinkTarget } from "@/shared/electronApi";
import { checkForAppUpdates, loadAppInfo, openAppExternalLink } from "@/services/appApi";
import { Bug, ExternalLink, RefreshCw } from "lucide-react";
import classNames from "classnames";
import { useTranslation } from "react-i18next";

export function AboutSettingsPage() {
  const { t } = useTranslation();
  const translate = t;
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [updateResult, setUpdateResult] = useState<CheckForUpdatesResult | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  useEffect(() => {
    loadAppInfo().then(setAppInfo).catch(() => setAppInfo({ name: "Navo", version: "" }));
  }, []);

  async function handleCheckForUpdates() {
    setIsCheckingUpdates(true);
    setUpdateResult(null);

    try {
      const result = await checkForAppUpdates();
      setUpdateResult(result);
    } catch (error) {
      setUpdateResult({
        hasUpdate: false,
        message: "检查更新失败",
      });
    } finally {
      setIsCheckingUpdates(false);
    }
  }

  return (
    <>
      <SettingsPageHeader title={translate("关于")} />

      <section className="mb-6">
        <SettingsSectionHeader
          title={appInfo?.name ?? "Navo"}
        />
        <SettingsList>
          <SettingsRow title={appInfo ? appInfo.version ? `v${appInfo.version}` : t("未知") : t("读取中")} description={updateResult ? t(updateResult.message === "UPDATES_UNAVAILABLE" ? "更新服务尚未接入。" : updateResult.message) : undefined}>
            <Button className="h-8 rounded-lg px-3 text-xs font-normal" disabled={isCheckingUpdates} type="button" variant="secondary" onClick={handleCheckForUpdates}>
              <RefreshCw aria-hidden="true" className={classNames("size-3.5", isCheckingUpdates && "animate-spin")} />
              {isCheckingUpdates ? translate("检查中") : translate("检查更新")}
            </Button>
          </SettingsRow>
        </SettingsList>
      </section>


      <section>
        <SettingsSectionHeader title={translate("支持")} description={translate("了解产品或反馈使用中遇到的问题。")} />
        <SettingsList>
          <SettingsRow title={translate("官网")} description={translate("查看 Navo 的产品信息")}>
            <ExternalLinkButton target="website"><ExternalLink aria-hidden="true" className="size-3.5" />{translate("打开官网")}</ExternalLinkButton>
          </SettingsRow>
          <SettingsRow title={translate("问题反馈")} description={translate("报告问题，帮助改进使用体验")}>
            <ExternalLinkButton target="report-bug"><Bug aria-hidden="true" className="size-3.5" />{translate("报告 Bug")}</ExternalLinkButton>
          </SettingsRow>
        </SettingsList>
      </section>
    </>
  );
}

interface ExternalLinkButtonProps {
  /** 外部链接白名单目标，由主进程转换成真实 URL。 */
  target: ExternalLinkTarget;
  /** 按钮内容，通常是图标加文字。 */
  children: ReactNode;
}

function ExternalLinkButton({ target, children }: ExternalLinkButtonProps) {
  return (
    <Button className="h-8 rounded-lg px-3 text-xs font-normal" type="button" variant="secondary" onClick={() => void openAppExternalLink(target)}>
      {children}
    </Button>
  );
}
