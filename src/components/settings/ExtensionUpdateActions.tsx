import { RefreshCw, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { getExtensionsApi } from "@/services/extensionsApi";
import { extensionErrorKeys } from "@/services/extensionErrorMessages";
import type { ExtensionStatus } from "@/shared/extensionTypes";

interface ExtensionUpdateActionsProps {
  /** 主进程返回的检查结果；不会由界面自行比较或拼装下载地址。 */
  status: ExtensionStatus;
  /** 安装、更新或其他操作进行时禁用冲突按钮。 */
  busy: boolean;
  /** 统一处理 IPC 错误并刷新安装状态。 */
  run: (action: () => Promise<void>) => Promise<boolean>;
}
export function ExtensionUpdateActions({ status, busy, run }: ExtensionUpdateActionsProps) {
  const { t, i18n } = useTranslation(["settings"]);
  const checkedAt = status.checkedAt ? new Date(status.checkedAt).toLocaleString(i18n.resolvedLanguage) : null;
  let message = t("settings:labs.updateHint");
  if (status.checking) message = t("settings:labs.checkingUpdates");
  else if (status.updateAvailable) message = t("settings:labs.updateAvailable", { version: status.availableVersion });
  else if (status.checkedAt && !status.updateError)
    message = status.version ? t("settings:labs.upToDate") : t("settings:labs.availableRelease", { version: status.availableVersion });
  return (
    <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
      <div className="min-w-0 flex-1" role="status" aria-live="polite">
        <span className={status.updateAvailable ? "text-foreground" : undefined}>{message}</span>
        {checkedAt && <p className="mt-1">{t("settings:labs.lastChecked", { time: checkedAt })}</p>}
        {status.updateError && (
          <p role="alert" className="mt-1 text-destructive">
            {t(extensionErrorKeys[status.updateError])}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy || status.checking}
        onClick={() => void run(() => getExtensionsApi().checkForUpdates())}
      >
        <RefreshCw className={status.checking ? "size-3.5 animate-spin" : "size-3.5"} />
        {t("settings:labs.checkUpdates")}
      </Button>
      {status.updateAvailable && (
        <Button size="sm" disabled={busy || status.checking} onClick={() => void run(() => getExtensionsApi().update())}>
          <Download className="size-3.5" />
          {t(status.operation === "updating" ? "settings:labs.updating" : "settings:labs.update")}
        </Button>
      )}
    </div>
  );
}
