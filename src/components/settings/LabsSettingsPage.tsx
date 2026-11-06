import { extensionErrorKeys } from "@/services/extensionErrorMessages";
import { normalizeExtensionErrorCode } from "@/shared/extensionErrors";
import { useState } from "react";
import { FlaskConical, Download, FolderOpen, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useExtensions } from "@/hooks/useExtensions";
import { getExtensionsApi } from "@/services/extensionsApi";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { SettingsPageHeader, SettingsSectionHeader, SettingsList, SettingsRow } from "./settingsPrimitives";

export function LabsSettingsPage() {
  const { t } = useTranslation(["common", "settings"]);
  const { status, error, pending, refresh, run } = useExtensions();
  const [confirm, setConfirm] = useState(false);
  const busy = pending || (status?.operation !== undefined && status.operation !== "idle");
  const message = error || status?.error;
  return (
    <>
      <SettingsPageHeader title={t("settings:pages.labs")} />
      <SettingsSectionHeader title={t("settings:labs.title")} description={t("settings:labs.description")} />
      {!status ? (
        <div className="text-xs text-muted-foreground">
          <p>{error ? t("settings:labs.loadFailed") : t("settings:labs.loading")}</p>
          {error && (
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              {t("settings:labs.retry")}
            </Button>
          )}
        </div>
      ) : (
        <SettingsList>
          <SettingsRow
            title={t("settings:labs.traceTitle")}
            description={t("settings:labs.traceDescription")}
            icon={<FlaskConical className="size-5 text-muted-foreground" />}
          >
            {status.version ? (
              <Switch
                checked={status.enabled}
                disabled={busy || !status.compatible}
                aria-label={t("settings:labs.enable")}
                onCheckedChange={(enabled) => void run(() => getExtensionsApi().setEnabled(enabled))}
              />
            ) : (
              <Button size="sm" disabled={busy} onClick={() => void run(() => getExtensionsApi().install("download"))}>
                <Download className="size-3.5" />
                {t(status.operation === "installing" ? "settings:labs.installing" : "settings:labs.install")}
              </Button>
            )}
          </SettingsRow>
          <div className="flex flex-wrap items-center gap-3 px-4 pb-4 text-xs text-muted-foreground">
            <span>
              {status.version
                ? `${t(status.enabled ? "settings:labs.enabled" : "settings:labs.disabled")} · v${status.version}`
                : `${t("settings:labs.notInstalled")} · v${status.availableVersion}`}
            </span>
            <span>Claude Code · Codex</span>
            <span>{Math.ceil(status.downloadBytes / 1024)} KB</span>
            <div className="ml-auto flex flex-wrap gap-1">
              {!status.version && status.operation === "idle" && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => getExtensionsApi().install("file"))}>
                  <FolderOpen className="size-3.5" />
                  {t("settings:labs.installFile")}
                </Button>
              )}
              {(status.version || status.operation === "uninstalling") && (
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirm(true)}>
                  <Trash2 className="size-3.5" />
                  {t("settings:labs.uninstall")}
                </Button>
              )}
              {status.operation === "installing" && (
                <Button variant="ghost" size="sm" onClick={() => void getExtensionsApi().cancelInstall()}>
                  {t("settings:labs.cancel")}
                </Button>
              )}
            </div>
          </div>
          {status.operation === "installing" && (
            <div className="px-4 pb-4">
              <progress className="h-1 w-full" max={100} value={status.progress} aria-label={t("settings:labs.installing")} />
              <p className="mt-1 text-xs text-muted-foreground">{status.progress}%</p>
            </div>
          )}
        </SettingsList>
      )}
      {message && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {t(extensionErrorKeys[normalizeExtensionErrorCode(message)])}
        </p>
      )}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogTitle>{t("settings:labs.uninstallTitle")}</DialogTitle>
          <DialogDescription>{t("settings:labs.uninstallDescription")}</DialogDescription>
          <DialogFooter>
            <Button autoFocus variant="outline" disabled={pending} onClick={() => setConfirm(false)}>
              {t("settings:labs.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                void run(() => getExtensionsApi().uninstall()).then((success) => {
                  if (success) setConfirm(false);
                })
              }
            >
              {t("settings:labs.uninstall")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
