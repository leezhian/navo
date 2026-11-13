import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { getExtensionsApi } from "@/services/extensionsApi";
import { extensionErrorKey } from "@/services/extensionErrorMessages";
import type { ExtensionStatus } from "@/shared/extensionTypes";

interface ExtensionUpdateActionsProps {
  /** 主进程返回的检查结果；不会由界面自行比较或拼装下载地址。 */
  status: ExtensionStatus;
  /** 安装、更新或其他操作进行时禁用冲突按钮。 */
  busy: boolean;
  /** 统一处理 IPC 错误并刷新安装状态。 */
  run: (action: () => Promise<void>) => Promise<boolean>;
}

/**
 * 启用开关旁的更新入口。没有新版本时只显示检查图标；
 * 已有兼容新版时改为「更新」，点击后才下载安装。检查进行中不能开始安装。
 */
export function ExtensionUpdateButton({ status, busy, run }: ExtensionUpdateActionsProps) {
  const { t } = useTranslation(["settings"]);
  const disabled = busy || status.checking;
  if (status.updateAvailable) {
    return (
      <Button size="sm" disabled={disabled} onClick={() => void run(() => getExtensionsApi().update())}>
        {t(status.operation === "updating" ? "settings:labs.updating" : "settings:labs.update")}
      </Button>
    );
  }
  return (
    <IconTooltip
      label={t("settings:labs.checkUpdates")}
      size="icon-sm"
      disabled={disabled}
      onClick={() => void run(() => getExtensionsApi().checkForUpdates())}
    >
      <RefreshCw className={status.checking ? "size-3.5 animate-spin" : "size-3.5"} />
    </IconTooltip>
  );
}

/** 检查进度、可用更新、上次成功时间和需要展示的失败原因。没有内容时不占一行。 */
export function ExtensionUpdateActions({ status }: Pick<ExtensionUpdateActionsProps, "status">) {
  const { t, i18n } = useTranslation(["settings"]);
  const checkedAt = status.checkedAt ? new Date(status.checkedAt).toLocaleString(i18n.resolvedLanguage) : null;
  const updateErrorKey = status.updateError ? extensionErrorKey(status.updateError) : null;
  let message: string | null = null;
  if (status.checking) message = t("settings:labs.checkingUpdates");
  else if (status.updateAvailable) message = t("settings:labs.updateAvailable", { version: status.availableVersion });
  else if (status.checkedAt && !status.updateError)
    message = status.version ? t("settings:labs.upToDate") : t("settings:labs.availableRelease", { version: status.availableVersion });
  if (!message && !checkedAt && !updateErrorKey) return null;
  const followsStatus = Boolean(message || checkedAt);
  return (
    <div className="border-t px-4 py-3 text-xs text-muted-foreground">
      <div role="status" aria-live="polite">
        {message && <span className={status.updateAvailable ? "text-foreground" : undefined}>{message}</span>}
        {checkedAt && <p className={message ? "mt-1" : undefined}>{t("settings:labs.lastChecked", { time: checkedAt })}</p>}
        {updateErrorKey && (
          <p role="alert" className={followsStatus ? "mt-1 text-destructive" : "text-destructive"}>
            {t(updateErrorKey)}
          </p>
        )}
      </div>
    </div>
  );
}
