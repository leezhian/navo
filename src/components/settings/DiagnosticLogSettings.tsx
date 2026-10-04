import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Check, Copy, ExternalLink, FolderOpen, Trash2 } from "lucide-react";
import { settingsApi } from "@/services/settingsApi";
import { getSettingsError } from "@/services/settingsErrors";
import { useSettingsStore } from "@/stores/settingsStore";
import { SettingsList, SettingsSectionHeader } from "./settingsPrimitives";
import { SettingsTextField } from "./SettingsTextField";

interface DiagnosticLogSettingsProps {
  /** 当前日志文件的完整路径，用于展示和复制。 */
  filePath: string;
  /** 完整路径输入或目录选择完成后保存新位置，后续日志写入此文件。 */
  onPathChange: (filePath: string) => void;
}

export function DiagnosticLogSettings({ filePath, onPathChange }: DiagnosticLogSettingsProps) {
  const { t } = useTranslation(["common", "settings"]);
  const saving = useSettingsStore((state) => state.saving);
  const saveError = useSettingsStore((state) => state.saveError);
  const [logFailed, setLogFailed] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const controlsBusy = saving || choosing || clearing || revealing;
  const actionsDisabled = controlsBusy || saveError !== null;

  useEffect(() => { setCopied(false); setCleared(false); setError(null); }, [filePath]);

  useEffect(() => {
    let active = true;
    if (!saving) void settingsApi.getLogsStatus().then((status) => {
      if (active) setLogFailed(status.failed);
    }).catch((failure) => { if (active) setError(failure); });
    return () => { active = false; };
  }, [saving]);

  function commitPath(value: string) {
    const nextPath = value.trim();
    if (!nextPath) { setError(new Error("INVALID_LOG_FILE")); return; }
    setError(null);
    onPathChange(nextPath);
  }

  async function choosePath() {
    setChoosing(true);
    setError(null);
    try {
      const nextPath = await settingsApi.chooseLogFile();
      if (nextPath) onPathChange(nextPath);
    } catch (failure) { setError(failure); }
    finally { setChoosing(false); }
  }

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

  return <section className="mb-6">
    <SettingsSectionHeader title={t("settings:logs.title")} description={t("settings:logs.description")} />
    {error !== null ? <p role="alert" className="mb-3 text-xs text-destructive">{getSettingsError(error)}</p>
      : logFailed && <p role="alert" className="mb-3 text-xs text-destructive">{t("settings:logs.writeError")}</p>}
    <SettingsList className="settings-log-panel">
      <div className="flex min-w-0 items-center gap-2">
        <SettingsTextField label={t("settings:logs.file")} className="min-w-0 flex-1 font-mono text-[12px]" value={filePath} disabled={controlsBusy} onCommit={commitPath} />
        <IconTooltip label={t("settings:general.chooseDirectory") + ": " + t("settings:logs.file")} className="shrink-0" variant="ghost" disabled={controlsBusy} onClick={() => void choosePath()}><FolderOpen className="size-4" /></IconTooltip>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-1">
        {cleared && <span role="status" className="mr-auto text-xs text-muted-foreground">{t("settings:logs.cleared")}</span>}
        <Button aria-label={t("common:actions.reveal")} className="h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground" variant="ghost" disabled={actionsDisabled || !filePath} onClick={() => void revealFile()}><ExternalLink aria-hidden="true" className="size-3.5" />{t("common:actions.open")}</Button>
        <Button className="h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground" variant="ghost" disabled={actionsDisabled || !filePath} onClick={() => void copyPath()}>{copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}{t(copied ? "common:feedback.copied" : "common:actions.copyPath")}</Button>
        <Button className="h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-destructive" variant="ghost" disabled={actionsDisabled} onClick={() => void clearLogs()}><Trash2 aria-hidden="true" className="size-3.5" />{t(clearing ? "settings:logs.clearing" : "settings:logs.clear")}</Button>
      </div>
    </SettingsList>
  </section>;
}
