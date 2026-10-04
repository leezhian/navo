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
  const { t } = useTranslation(["common", "settings"]);
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
        message: "UPDATE_CHECK_FAILED",
      });
    } finally {
      setIsCheckingUpdates(false);
    }
  }

  const updateMessage = !updateResult ? undefined
    : updateResult.message === "UPDATES_UNAVAILABLE" ? t("settings:about.updatesUnavailable")
    : updateResult.message === "UPDATE_CHECK_FAILED" ? t("settings:about.checkFailed")
    : updateResult.message;

  return (
    <>
      <SettingsPageHeader title={translate("settings:pages.about")} />

      <section className="mb-6">
        <SettingsSectionHeader
          title={appInfo?.name ?? "Navo"}
        />
        <SettingsList>
          <SettingsRow title={appInfo ? appInfo.version ? `v${appInfo.version}` : t("common:fields.unknown") : t("common:status.loading")} description={updateMessage}>
            <Button className="h-8 rounded-lg px-3 text-xs font-normal" disabled={isCheckingUpdates} type="button" variant="secondary" onClick={handleCheckForUpdates}>
              <RefreshCw aria-hidden="true" className={classNames("size-3.5", isCheckingUpdates && "animate-spin")} />
              {isCheckingUpdates ? translate("common:status.checking") : translate("settings:about.checkUpdates")}
            </Button>
          </SettingsRow>
        </SettingsList>
      </section>


      <section>
        <SettingsSectionHeader title={translate("settings:about.support")} description={translate("settings:about.supportDescription")} />
        <SettingsList>
          <SettingsRow title={translate("settings:about.website")} description={translate("settings:about.websiteDescription")}>
            <ExternalLinkButton target="website"><ExternalLink aria-hidden="true" className="size-3.5" />{translate("settings:about.openWebsite")}</ExternalLinkButton>
          </SettingsRow>
          <SettingsRow title={translate("settings:about.feedback")} description={translate("settings:about.feedbackDescription")}>
            <ExternalLinkButton target="report-bug"><Bug aria-hidden="true" className="size-3.5" />{translate("settings:about.reportBug")}</ExternalLinkButton>
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
