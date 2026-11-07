import { useTranslation } from "react-i18next";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { isApplePlatform } from "@/utils/platform";
import { SettingsList, SettingsRow, SettingsSectionHeader } from "./settingsPrimitives";

export function SettingsShortcuts() {
  const { t } = useTranslation(["settings", "common"]);
  const mod = isApplePlatform() ? "⌘" : "Ctrl";
  return <section>
    <SettingsSectionHeader title={t("settings:general.shortcuts")} description={t("settings:general.shortcutsDescription")} />
    <SettingsList>
      <SettingsRow title={t("settings:general.shortcutsSettings")}><KbdGroup><Kbd>{mod}</Kbd><Kbd>,</Kbd></KbdGroup></SettingsRow>
      <SettingsRow title={t("settings:general.shortcutsRenameTask")} description={t("settings:general.shortcutsRenameTaskDescription")}><Kbd>F2</Kbd></SettingsRow>
      <SettingsRow title={t("settings:general.shortcutsToggleContext")}><KbdGroup><Kbd>{mod}</Kbd><Kbd>B</Kbd></KbdGroup></SettingsRow>
      <SettingsRow title={t("settings:general.shortcutsToggleTerminal")}><KbdGroup><Kbd>{mod}</Kbd><Kbd>J</Kbd></KbdGroup></SettingsRow>
      <SettingsRow title={t("settings:general.shortcutsMaximizeTerminal")} description={t("settings:general.shortcutsMaximizeTerminalDescription")}><KbdGroup><Kbd>{mod}</Kbd><Kbd>Shift</Kbd><Kbd>J</Kbd></KbdGroup></SettingsRow>
      <SettingsRow title={t("settings:general.shortcutsResize")} description={t("settings:general.shortcutsResizeDescription")}><KbdGroup><Kbd>←</Kbd><Kbd>→</Kbd></KbdGroup></SettingsRow>
      <SettingsRow title={t("settings:general.shortcutsSelect")} description={t("settings:general.shortcutsSelectDescription")}><KbdGroup><Kbd>↑</Kbd><Kbd>↓</Kbd><Kbd>←</Kbd><Kbd>→</Kbd></KbdGroup></SettingsRow>
      {import.meta.env.DEV && <SettingsRow title={t("settings:general.shortcutsDevTools")}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><KbdGroup><Kbd>{mod}</Kbd><Kbd>{isApplePlatform() ? "⌥" : "Shift"}</Kbd><Kbd>I</Kbd></KbdGroup><span>/</span><Kbd>F12</Kbd></div>
      </SettingsRow>}
    </SettingsList>
  </section>;
}
