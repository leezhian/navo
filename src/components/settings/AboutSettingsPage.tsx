import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SettingsList, SettingsPageHeader, SettingsSectionHeader } from "./settingsPrimitives";
import type { AppInfo, CheckForUpdatesResult, ExternalLinkTarget } from "@/shared/electronApi";
import { checkForAppUpdates, loadAppInfo, openAppExternalLink } from "@/services/appApi";
import { cleanReviewStorage } from "@/services/reviewApi";
import { Bug, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import classNames from "classnames";

export function AboutSettingsPage() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [updateResult, setUpdateResult] = useState<CheckForUpdatesResult | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [cleanMessage, setCleanMessage] = useState<string | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);

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

  async function handleCleanStorage() {
    setIsCleaning(true);
    setCleanMessage(null);

    try {
      const result = await cleanReviewStorage();
      setCleanMessage(
        result.removedItems > 0
          ? `已清理 ${result.removedItems} 项，释放 ${formatBytes(result.freedBytes)}`
          : "没有可清理的内容",
      );
    } catch (error) {
      setCleanMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCleaning(false);
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

      <section className="mb-10">
        <SettingsSectionHeader
          title="存储"
          description="清理不在会话列表中的本地缓存，包括已归档会话的 diff 快照、过期的进行中基线和历史日志。"
        />
        <SettingsList>
          <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">{cleanMessage ?? "会话列表中的数据不受影响。"}</span>
            <Button
              className="shrink-0 font-normal"
              disabled={isCleaning}
              type="button"
              variant="outline"
              onClick={handleCleanStorage}
            >
              <Trash2 className="size-4" />
              {isCleaning ? "清理中" : "清理缓存"}
            </Button>
          </div>
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
    <div className="flex min-h-14 items-center justify-between gap-4 border-b px-4 py-2.5 text-sm last:border-b-0">
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

/** 把字节数格式化为可读文案，用于清理结果提示。 */
function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
