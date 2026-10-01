import { useTranslation } from "react-i18next";
import type { Dispatch, SetStateAction } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import type { AppSettings, ThemePreference } from "@/domain/types";
import { SettingsList, SettingsRow, SettingsSectionHeader } from "./settingsPrimitives";
import { SettingsChoiceControl } from "./SettingsChoiceControl";

const appThemeOptions = [
  { icon: Monitor, label: "跟随系统", value: "system" as const },
  { icon: Sun, label: "浅色", value: "light" as const },
  { icon: Moon, label: "深色", value: "dark" as const },
];

interface AppearanceThemeSettingsProps {
  /** 当前应用设置，用于显示选中的界面主题。 */
  settings: AppSettings;
  /** 主题选择后立即生效，并沿用已有本地持久化。 */
  updateSettings: Dispatch<SetStateAction<AppSettings>>;
}

export function AppearanceThemeSettings({ settings, updateSettings }: AppearanceThemeSettingsProps) {
  const { t: translate } = useTranslation();
  return (
    <section className="mb-6">
      <SettingsSectionHeader title={translate("视觉风格")} />
      <SettingsList>
        <SettingsRow title={translate("颜色模式")} description={translate("选择浅色、深色或跟随系统外观")}>
          <SettingsChoiceControl<ThemePreference> label={translate("颜色模式")} options={appThemeOptions.map((option) => ({ ...option, label: translate(option.label) }))} value={settings.theme}
            onValueChange={(theme) => updateSettings((current) => ({ ...current, theme }))} />
        </SettingsRow>
      </SettingsList>
    </section>
  );
}
