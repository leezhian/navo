import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppSettings } from "@/domain/types";
import { supportedLocales } from "@/shared/locales";
import { useSettingsStore } from "@/stores/settingsStore";
import { settingsApi } from "@/services/settingsApi";
import { getSettingsError } from "@/services/settingsErrors";
import { SettingsList, SettingsPageHeader, SettingsRow, SettingsSectionHeader } from "./settingsPrimitives";
import { SettingsTextField } from "./SettingsTextField";
import { SettingsChoiceControl } from "./SettingsChoiceControl";
import { DiagnosticLogSettings } from "./DiagnosticLogSettings";

interface GeneralSettingsPageProps {
  /** 当前偏好；任务和唤醒设置仅作为后续功能默认值。 */
  settings: AppSettings;
  /** 更新缓存并由主进程持久化，失败显示未保存状态。 */
  updateSettings: Dispatch<SetStateAction<AppSettings>>;
}

type DirectorySettingKey = "repositoriesDirectory" | "worktreesDirectory" | "tasksDirectory";

export function GeneralSettingsPage({ settings, updateSettings }: GeneralSettingsPageProps) {
  const { t } = useTranslation(["common", "settings"]);
  const defaultLogFilePath = useSettingsStore((state) => state.logFilePath);
  const logFilePath = settings.logFilePath || defaultLogFilePath;
  const [error, setError] = useState<unknown>(null);
  const [choosing, setChoosing] = useState(false);
  const update = <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) => updateSettings((current) => ({ ...current, [key]: value }));

  async function chooseDirectory(key: DirectorySettingKey) {
    setChoosing(true);
    setError(null);
    try { const directory = await settingsApi.chooseDirectory(); if (directory) update(key, directory); }
    catch (failure) { setError(failure); }
    finally { setChoosing(false); }
  }

  const directoryControl = (key: DirectorySettingKey, label: string, value: string) => <>
    <SettingsTextField label={label} value={value} onCommit={(next) => update(key, next.trim())} />
    <IconTooltip label={t("settings:general.chooseDirectory") + ": " + label} disabled={choosing} size="icon-sm" variant="secondary" onClick={() => void chooseDirectory(key)}><FolderOpen className="size-4" /></IconTooltip>
  </>;

  return <>
    <SettingsPageHeader title={t("settings:pages.general")} />
    {error !== null && <p role="alert" className="mb-4 text-xs text-destructive">{getSettingsError(error)}</p>}
    <section className="mb-6">
      <SettingsSectionHeader title={t("settings:general.directories")} />
      <SettingsList>
        <SettingsRow title={t("settings:general.repositoriesDirectory")} description={t("settings:general.repositoriesDescription")}>{directoryControl("repositoriesDirectory", t("settings:general.repositoriesDirectory"), settings.repositoriesDirectory)}</SettingsRow>
        <SettingsRow title={t("settings:general.worktreesDirectory")} description={t("settings:general.worktreesDescription")}>{directoryControl("worktreesDirectory", t("settings:general.worktreesDirectory"), settings.worktreesDirectory)}</SettingsRow>
        <SettingsRow title={t("settings:general.tasksDirectory")} description={t("settings:general.tasksDirectoryDescription")}>{directoryControl("tasksDirectory", t("settings:general.tasksDirectory"), settings.tasksDirectory)}</SettingsRow>
      </SettingsList>
    </section>
    <section className="mb-6">
      <SettingsSectionHeader title={t("settings:general.tasks")} />
      <SettingsList>
        <SettingsRow title={t("settings:general.taskMode")} description={t("settings:general.taskModeDescription")}>
          <Select value={settings.defaultTaskMode} onValueChange={(value) => update("defaultTaskMode", value as AppSettings["defaultTaskMode"])}>
            <SelectTrigger aria-label={t("settings:general.taskMode")} className="h-8 w-52 bg-background text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{([["worktree", "settings:general.modes.worktree"], ["new-branch", "settings:general.modes.newBranch"], ["current-branch", "settings:general.modes.currentBranch"]] as const).map(([value, label]) => <SelectItem key={value} value={value}>{t(label)}</SelectItem>)}</SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow title={t("settings:general.branchPrefix")}><SettingsTextField label={t("settings:general.branchPrefix")} value={settings.branchPrefix} onCommit={(value) => update("branchPrefix", value)} /></SettingsRow>
        <SettingsRow title={t("settings:general.keepAwake")} description={t("settings:general.keepAwakeDescription")}><Switch aria-label={t("settings:general.keepAwake")} checked={settings.keepAwakeDuringAgent} onCheckedChange={(value) => update("keepAwakeDuringAgent", value)} /></SettingsRow>
      </SettingsList>
    </section>
    <DiagnosticLogSettings filePath={logFilePath} onPathChange={(filePath) => update("logFilePath", filePath)} />
    <section className="mb-6">
      <SettingsSectionHeader title={t("settings:general.language")} />
      <SettingsList><SettingsRow title={t("settings:general.interfaceLanguage")} description={t("settings:general.languageDescription")}>
        <SettingsChoiceControl label={t("settings:general.interfaceLanguage")} value={settings.locale} options={supportedLocales} onValueChange={(value) => update("locale", value)} />
      </SettingsRow></SettingsList>
    </section>
    <section>
      <SettingsSectionHeader title={t("settings:general.shortcuts")} description={t("settings:general.shortcutsDescription")} />
      <SettingsList>
        <SettingsRow title={t("settings:general.shortcutsSettings")}><kbd className="text-xs text-muted-foreground">{navigator.platform.includes("Mac") ? "⌘ ," : "Ctrl ,"}</kbd></SettingsRow>
        <SettingsRow title={t("settings:general.shortcutsResize")}><span className="text-xs text-muted-foreground">{t("settings:general.shortcutsResizeDescription")}</span></SettingsRow>
        <SettingsRow title={t("settings:general.shortcutsSelect")}><span className="text-xs text-muted-foreground">{t("settings:general.shortcutsSelectDescription")}</span></SettingsRow>
        {import.meta.env.DEV && <SettingsRow title={t("settings:general.shortcutsDevTools")}><kbd className="text-xs text-muted-foreground">{navigator.platform.includes("Mac") ? "⌘ ⌥ I / F12" : "Ctrl Shift I / F12"}</kbd></SettingsRow>}
      </SettingsList>
    </section>
  </>;
}
