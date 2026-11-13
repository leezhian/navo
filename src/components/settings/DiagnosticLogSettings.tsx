import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Check, Copy, ExternalLink, Trash2 } from "lucide-react";
import { settingsApi } from "@/services/settingsApi";
import { getSettingsError } from "@/services/settingsErrors";
import { useSettingsStore } from "@/stores/settingsStore";
import { SettingsRow } from "./settingsPrimitives";

export function DiagnosticLogSettings() {
  const { t } = useTranslation(["common", "settings"]);
  const filePath = useSettingsStore((state) => state.settings.logFilePath || state.logFilePath);
  const saving = useSettingsStore((state) => state.saving);
  const saveError = useSettingsStore((state) => state.saveError);
  const [logFailed, setLogFailed] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const controlsBusy = saving || clearing || revealing;
  const actionsDisabled = controlsBusy || saveError !== null;

  useEffect(() => { setCopied(false); setCleared(false); setError(null); }, [filePath]);

  useEffect(() => {
    let active = true;
    if (!saving) void settingsApi.getLogsStatus().then((status) => {
      if (active) setLogFailed(status.failed);
    }).catch((failure) => { if (active) setError(failure); });
    return () => { active = false; };
  }, [saving]);

  async function revealFile() {
    setRevealing(true);
    setError(null);
    try { await settingsApi.revealLogFile(); }
    catch (failure) { setError(failure); }
    finally { setRevealing(false); }
  }

  async function copyPath() {
    setError(null);
    setCopied(false);
    try { await navigator.clipboard.writeText(filePath); setCopied(true); }
    catch (failure) { setError(failure); }
  }

  async function clearLogs() {
    if (clearing) return;
    setClearing(true);
    setCleared(false);
    setError(null);
    try {
      await settingsApi.clearLogs();
      setLogFailed(false);
      setCleared(true);
    } catch (failure) { setError(failure); }
    finally { setClearing(false); }
  }

  return <SettingsRow title={t("settings:logs.title")} description={t("settings:logs.description")}>
    <div className="flex max-w-full flex-col items-end gap-2">
      <div role="group" aria-label={t("settings:logs.title")} className="flex flex-wrap justify-end gap-1">
        <Button className="h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground" variant="ghost" disabled={actionsDisabled || !filePath} onClick={() => void copyPath()}>{copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}{t(copied ? "common:feedback.copied" : "common:actions.copyPath")}</Button>
        <Button aria-label={t("common:actions.reveal")} className="h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground" variant="ghost" disabled={actionsDisabled || !filePath} onClick={() => void revealFile()}><ExternalLink aria-hidden="true" className="size-3.5" />{t("common:actions.open")}</Button>
        <Button className="h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-destructive" variant="ghost" disabled={actionsDisabled} onClick={() => void clearLogs()}><Trash2 aria-hidden="true" className="size-3.5" />{t(clearing ? "settings:logs.clearing" : "settings:logs.clear")}</Button>
      </div>
      {error !== null ? <p role="alert" className="text-xs text-destructive">{getSettingsError(error)}</p>
        : logFailed ? <p role="alert" className="text-xs text-destructive">{t("settings:logs.writeError")}</p>
        : cleared && <span role="status" className="text-xs text-muted-foreground">{t("settings:logs.cleared")}</span>}
    </div>
  </SettingsRow>;
}
