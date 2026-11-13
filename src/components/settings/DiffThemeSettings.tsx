import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsRow } from "@/components/settings/settingsPrimitives";
import { diffDarkThemeOptions, diffLightThemeOptions } from "@/domain/settings";
import type { AppSettings, DiffDarkThemePreset, DiffLightThemePreset } from "@/domain/types";
import type { Dispatch, SetStateAction } from "react";

interface DiffThemeSettingsProps {
  /** 当前应用设置，用于读取浅色和深色 diff 主题预设。 */
  settings: AppSettings;
  /** 更新 diff 主题设置，并同步到审查区和预览区的 Pierre options。 */
  updateSettings: Dispatch<SetStateAction<AppSettings>>;
}

export function DiffThemeSettings({ settings, updateSettings }: DiffThemeSettingsProps) {
  const { t: translate } = useTranslation(["common", "settings"]);
  return (
    <>
      <SettingsRow title={translate("settings:appearance.diff.lightCodeTheme")} description={translate("settings:appearance.diff.lightDescription")}>
        <ThemeSelect
          ariaLabel={translate("settings:appearance.diff.lightTheme")}
          options={diffLightThemeOptions}
          value={settings.diffLightTheme}
          onChange={(value) => updateDiffTheme(updateSettings, "diffLightTheme", value)}
        />
      </SettingsRow>
      <SettingsRow title={translate("settings:appearance.diff.darkCodeTheme")} description={translate("settings:appearance.diff.darkDescription")}>
        <ThemeSelect
          ariaLabel={translate("settings:appearance.diff.darkTheme")}
          options={diffDarkThemeOptions}
          value={settings.diffDarkTheme}
          onChange={(value) => updateDiffTheme(updateSettings, "diffDarkTheme", value)}
        />
      </SettingsRow>
    </>
  );
}

interface ThemeSelectProps {
  /** select 的可访问名称。 */
  ariaLabel: string;
  /** 当前模式可选的 Pierre/Shiki 主题列表，浅色和深色分开维护以避免误选。 */
  options: Array<{ label: string; value: DiffDarkThemePreset | DiffLightThemePreset }>;
  /** 当前主题预设。 */
  value: DiffDarkThemePreset | DiffLightThemePreset;
  /** 切换主题预设时触发。 */
  onChange: (value: DiffDarkThemePreset | DiffLightThemePreset) => void;
}

function ThemeSelect({ ariaLabel, options, value, onChange }: ThemeSelectProps) {
  return (
    <Select value={value} onValueChange={(nextValue) => onChange(nextValue as DiffDarkThemePreset | DiffLightThemePreset)}>
      <SelectTrigger aria-label={ariaLabel} className="h-8 w-[180px] rounded-lg bg-background text-xs font-normal shadow-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-xl p-2">
        {options.map((option) => (
          <SelectItem key={option.value} className="text-xs" value={option.value}>
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
  value: DiffDarkThemePreset | DiffLightThemePreset,
) {
  updateSettings((current) => ({
    ...current,
    [key]: value,
  }));
}
