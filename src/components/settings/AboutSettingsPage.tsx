import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SettingsList, SettingsPageHeader, SettingsSectionHeader } from "./settingsPrimitives";
import type { AppInfo, CheckForUpdatesResult, ExternalLinkTarget } from "@/shared/electronApi";
import { checkForAppUpdates, loadAppInfo, openAppExternalLink } from "@/services/appApi";
import { Bug, ExternalLink, RefreshCw } from "lucide-react";
import classNames from "classnames";

export function AboutSettingsPage() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [updateResult, setUpdateResult] = useState<CheckForUpdatesResult | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  useEffect(() => {
    loadAppInfo().then(setAppInfo).catch(() => setAppInfo({ name: "vibe-reviewer", version: "未知" }));
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
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsCheckingUpdates(false);
    }
  }

  return (
    <>
      <SettingsPageHeader title="关于" />

      <section className="mb-10">
        <SettingsSectionHeader
          title={appInfo?.name ?? "vibe-reviewer"}
          description="本地 AI 代码审查桌面应用"
        />
        <SettingsList>
          <AboutInfoRow label="当前版本" value={appInfo ? `v${appInfo.version}` : "读取中"} />
          <AboutInfoRow label="更新状态" value={updateResult?.message ?? "尚未检查更新"} />
        </SettingsList>
      </section>

      <div className="flex flex-wrap gap-2.5">
        <Button
          className="font-normal"
          disabled={isCheckingUpdates}
          type="button"
          variant="secondary"
          onClick={handleCheckForUpdates}
        >
          <RefreshCw className={classNames("size-4", isCheckingUpdates && "animate-spin")} />
          {isCheckingUpdates ? "检查中" : "检查更新"}
        </Button>
        <ExternalLinkButton target="website">
          <ExternalLink className="size-4" />
          官网
        </ExternalLinkButton>
        <ExternalLinkButton target="report-bug">
          <Bug className="size-4" />
          报告 Bug
        </ExternalLinkButton>
      </div>
    </>
  );
}

interface AboutInfoRowProps {
  /** 左侧信息项名称。 */
  label: string;
  /** 右侧信息项内容。 */
  value: string;
}

function AboutInfoRow({ label, value }: AboutInfoRowProps) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-b px-4 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
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
    <Button className="font-normal" type="button" variant="outline" onClick={() => void openAppExternalLink(target)}>
      {children}
    </Button>
  );
}
