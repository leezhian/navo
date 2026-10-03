import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppSettings } from "@/domain/types";
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

export function GeneralSettingsPage({ settings, updateSettings }: GeneralSettingsPageProps) {
  const { t } = useTranslation();
  const defaultLogFilePath = useSettingsStore((state) => state.logFilePath);
  const logFilePath = settings.logFilePath || defaultLogFilePath;
  const [error, setError] = useState<unknown>(null);
  const [choosing, setChoosing] = useState(false);
  const update = <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) => updateSettings((current) => ({ ...current, [key]: value }));

  async function chooseDirectory(key: "repositoriesDirectory" | "worktreesDirectory") {
    setChoosing(true);
    setError(null);
    try { const directory = await settingsApi.chooseDirectory(); if (directory) update(key, directory); }
    catch (failure) { setError(failure); }
    finally { setChoosing(false); }
  }

  const directoryControl = (key: "repositoriesDirectory" | "worktreesDirectory", label: string, value: string) => <>
    <SettingsTextField label={label} value={value} onCommit={(next) => update(key, next.trim())} />
    <IconTooltip label={t("选择目录") + ": " + label} disabled={choosing} size="icon-sm" variant="secondary" onClick={() => void chooseDirectory(key)}><FolderOpen className="size-4" /></IconTooltip>
  </>;

  return <>
    <SettingsPageHeader title={t("常规")} />
    {error !== null && <p role="alert" className="mb-4 text-xs text-destructive">{getSettingsError(error)}</p>}
    <section className="mb-6">
      <SettingsSectionHeader title={t("目录")} />
      <SettingsList>
        <SettingsRow title={t("仓库目录")} description={t("克隆仓库的默认目录。更改此目录或手动扫描时才扫描，启动时不扫描，因此移除的仓库不会重新出现。")}>{directoryControl("repositoriesDirectory", t("仓库目录"), settings.repositoriesDirectory)}</SettingsRow>
        <SettingsRow title={t("Worktree 目录")} description={t("新建 Worktree 的默认目录。")}>{directoryControl("worktreesDirectory", t("Worktree 目录"), settings.worktreesDirectory)}</SettingsRow>
      </SettingsList>
    </section>
    <section className="mb-6">
      <SettingsSectionHeader title={t("任务")} />
      <SettingsList>
        <SettingsRow title={t("任务执行模式")} description={t("作为创建任务时工作目录的默认执行方式。")}>
          <Select value={settings.defaultTaskMode} onValueChange={(value) => update("defaultTaskMode", value as AppSettings["defaultTaskMode"])}>
            <SelectTrigger aria-label={t("任务执行模式")} className="h-8 w-52 bg-background text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{[["worktree", "隔离 Worktree"], ["new-branch", "新建分支"], ["current-branch", "当前分支"]].map(([value, label]) => <SelectItem key={value} value={value}>{t(label)}</SelectItem>)}</SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow title={t("分支前缀")}><SettingsTextField label={t("分支前缀")} value={settings.branchPrefix} onCommit={(value) => update("branchPrefix", value)} /></SettingsRow>
        <SettingsRow title={t("保持唤醒")} description={t("Agent 会话启动、运行或等待你的输入时阻止系统睡眠或待机；远程访问开启时同样保持唤醒，避免连接因睡眠断开。屏幕仍可关闭。")}><Switch aria-label={t("保持唤醒")} checked={settings.keepAwakeDuringAgent} onCheckedChange={(value) => update("keepAwakeDuringAgent", value)} /></SettingsRow>
      </SettingsList>
    </section>
    <DiagnosticLogSettings filePath={logFilePath} onPathChange={(filePath) => update("logFilePath", filePath)} />
    <section className="mb-6">
      <SettingsSectionHeader title={t("语言")} />
      <SettingsList><SettingsRow title={t("界面语言")} description={t("切换后立即生效。")}>
        <SettingsChoiceControl label={t("界面语言")} value={settings.locale} options={[{ value: "en", label: "English" }, { value: "zh-CN", label: "简体中文" }]} onValueChange={(value) => update("locale", value)} />
      </SettingsRow></SettingsList>
    </section>
    <section>
      <SettingsSectionHeader title={t("快捷键")} description={t("仅列出已支持的操作，不支持自定义快捷键。")} />
      <SettingsList>
        <SettingsRow title={t("打开设置")}><kbd className="text-xs text-muted-foreground">{navigator.platform.includes("Mac") ? "⌘ ," : "Ctrl ,"}</kbd></SettingsRow>
        <SettingsRow title={t("调整面板宽度")}><span className="text-xs text-muted-foreground">{t("分隔条聚焦后使用 ← / →")}</span></SettingsRow>
        <SettingsRow title={t("选择控件选项")}><span className="text-xs text-muted-foreground">{t("控件聚焦后使用方向键")}</span></SettingsRow>
        {import.meta.env.DEV && <SettingsRow title={t("开发者工具（仅开发模式）")}><kbd className="text-xs text-muted-foreground">{navigator.platform.includes("Mac") ? "⌘ ⌥ I / F12" : "Ctrl Shift I / F12"}</kbd></SettingsRow>}
      </SettingsList>
    </section>
  </>;
}
