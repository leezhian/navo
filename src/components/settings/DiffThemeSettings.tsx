import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsList, SettingsRow } from "@/components/settings/settingsPrimitives";
import { diffThemeOptions } from "@/domain/settings";
import type { AppSettings, DiffThemePreset } from "@/domain/types";
import type { Dispatch, SetStateAction } from "react";

interface DiffThemeSettingsProps {
  /** 当前应用设置，用于读取浅色和深色 diff 主题预设。 */
  settings: AppSettings;
  /** 更新 diff 主题设置，并同步到审查区和预览区的 Pierre options。 */
  updateSettings: Dispatch<SetStateAction<AppSettings>>;
}

export function DiffThemeSettings({ settings, updateSettings }: DiffThemeSettingsProps) {
  return (
    <SettingsList>
      <SettingsRow title="浅色主题" description="选择浅色模式下的 diff 语法高亮主题">
        <ThemeSelect
          ariaLabel="浅色主题"
          value={settings.diffLightTheme}
          onChange={(value) => updateDiffTheme(updateSettings, "diffLightTheme", value)}
        />
      </SettingsRow>
      <SettingsRow title="深色主题" description="选择深色模式下的 diff 语法高亮主题">
        <ThemeSelect
          ariaLabel="深色主题"
          value={settings.diffDarkTheme}
          onChange={(value) => updateDiffTheme(updateSettings, "diffDarkTheme", value)}
        />
      </SettingsRow>
    </SettingsList>
  );
}

interface ThemeSelectProps {
  /** select 的可访问名称。 */
  ariaLabel: string;
  /** 当前主题预设。 */
  value: DiffThemePreset;
  /** 切换主题预设时触发。 */
  onChange: (value: DiffThemePreset) => void;
}

function ThemeSelect({ ariaLabel, value, onChange }: ThemeSelectProps) {
  return (
    <Select value={value} onValueChange={(nextValue) => onChange(nextValue as DiffThemePreset)}>
      <SelectTrigger aria-label={ariaLabel} className="w-[180px] bg-muted/60 font-normal">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {diffThemeOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function updateDiffTheme(
  updateSettings: Dispatch<SetStateAction<AppSettings>>,
  key: "diffLightTheme" | "diffDarkTheme",
  value: DiffThemePreset,
) {
  updateSettings((current) => ({
    ...current,
    [key]: value,
  }));
}
