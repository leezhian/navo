import { useTranslation } from "react-i18next";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { SettingsList, SettingsRow, SettingsSectionHeader } from "./settingsPrimitives";

export function SettingsShortcuts() {
  const { t } = useTranslation(["settings", "common"]);
  const isMac = navigator.platform.includes("Mac");
  return <section>
    <SettingsSectionHeader title={t("settings:general.shortcuts")} description={t("settings:general.shortcutsDescription")} />
    <SettingsList>
      <SettingsRow title={t("settings:general.shortcutsSettings")}><KbdGroup><Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd><Kbd>,</Kbd></KbdGroup></SettingsRow>
      <SettingsRow title={t("settings:general.shortcutsResize")} description={t("settings:general.shortcutsResizeDescription")}><KbdGroup><Kbd>←</Kbd><Kbd>→</Kbd></KbdGroup></SettingsRow>
      <SettingsRow title={t("settings:general.shortcutsSelect")} description={t("settings:general.shortcutsSelectDescription")}><KbdGroup><Kbd>↑</Kbd><Kbd>↓</Kbd><Kbd>←</Kbd><Kbd>→</Kbd></KbdGroup></SettingsRow>
      {import.meta.env.DEV && <SettingsRow title={t("settings:general.shortcutsDevTools")}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><KbdGroup><Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd><Kbd>{isMac ? "⌥" : "Shift"}</Kbd><Kbd>I</Kbd></KbdGroup><span>/</span><Kbd>F12</Kbd></div>
      </SettingsRow>}
    </SettingsList>
  </section>;
}
