import { useTranslation } from "react-i18next";
import type { Dispatch, SetStateAction } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import type { AppSettings, ThemePreference } from "@/domain/types";
import { SettingsList, SettingsRow, SettingsSectionHeader } from "./settingsPrimitives";
import { SettingsChoiceControl } from "./SettingsChoiceControl";

const appThemeOptions = [
  { icon: Monitor, label: "settings:appearance.system" as const, value: "system" as const },
  { icon: Sun, label: "settings:appearance.light" as const, value: "light" as const },
  { icon: Moon, label: "settings:appearance.dark" as const, value: "dark" as const },
];

interface AppearanceThemeSettingsProps {
  /** 当前应用设置，用于显示选中的界面主题。 */
  settings: AppSettings;
  /** 主题选择后立即生效，并沿用已有本地持久化。 */
  updateSettings: Dispatch<SetStateAction<AppSettings>>;
}

export function AppearanceThemeSettings({ settings, updateSettings }: AppearanceThemeSettingsProps) {
  const { t: translate } = useTranslation(["common", "settings"]);
  return (
    <section className="mb-6">
      <SettingsSectionHeader title={translate("settings:appearance.style")} />
      <SettingsList>
        <SettingsRow title={translate("settings:appearance.colorMode")} description={translate("settings:appearance.colorModeDescription")}>
          <SettingsChoiceControl<ThemePreference> label={translate("settings:appearance.colorMode")} options={appThemeOptions.map((option) => ({ ...option, label: translate(option.label) }))} value={settings.theme}
            onValueChange={(theme) => updateSettings((current) => ({ ...current, theme }))} />
        </SettingsRow>
      </SettingsList>
    </section>
  );
}
