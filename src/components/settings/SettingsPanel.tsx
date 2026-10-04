import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Folder, Info, Palette, Plug, Search, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AboutSettingsPage } from "./AboutSettingsPage";
import { AppearanceThemeSettings } from "./AppearanceThemeSettings";
import { DiffAppearanceSettings } from "./DiffAppearanceSettings";
import { GeneralSettingsPage } from "./GeneralSettingsPage";
import { ResourcesSettingsPage } from "./ResourcesSettingsPage";
import { IntegrationsSettingsPage } from "./IntegrationsSettingsPage";
import { SettingsPageHeader } from "./settingsPrimitives";
import type { AppSettings, ResolvedTheme } from "@/domain/types";
import "./settings.css";

type SettingsPage = "general" | "appearance" | "resources" | "integrations" | "about";
const settingsNavigation = [
  { id: "general" as const, title: "settings:pages.general" as const, icon: Settings },
  { id: "appearance" as const, title: "settings:pages.appearance" as const, icon: Palette },
  { id: "resources" as const, title: "settings:pages.resources" as const, icon: Folder },
  { id: "integrations" as const, title: "settings:pages.integrations" as const, icon: Plug },
  { id: "about" as const, title: "settings:pages.about" as const, icon: Info },
];

interface SettingsPanelProps {
  /** 当前本地偏好设置。 */
  settings: AppSettings;
  /** 应用实际主题，用于设置页的实时预览。 */
  resolvedTheme: ResolvedTheme;
  /** 更新主题和 diff 阅读偏好，保持原有本地持久化。 */
  updateSettings: Dispatch<SetStateAction<AppSettings>>;
}

export function SettingsPanel({ resolvedTheme, settings, updateSettings }: SettingsPanelProps) {
  const { t } = useTranslation(["common", "settings"]);
  const translate = t;
  const [activePage, setActivePage] = useState<SettingsPage>("general");
  const [searchKeyword, setSearchKeyword] = useState("");
  const visibleNavigation = settingsNavigation.filter((item) => t(item.title).toLowerCase().includes(searchKeyword.trim().toLowerCase()));

  return (
    <div className="navo-settings-workspace">
      <aside className="navo-settings-navigation" aria-label={translate("settings:navigation.label")}>
        <div className="relative mb-4">
          <Search aria-hidden="true" className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
          <Input aria-label={translate("settings:navigation.search")} className="h-8 pl-8 text-xs" placeholder={translate("settings:navigation.searchPlaceholder")} value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} />
        </div>
        <nav className="flex flex-col gap-1">
          {visibleNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <Button key={item.id} aria-pressed={activePage === item.id} className="h-8 justify-start gap-2 rounded-lg px-2 text-xs font-normal" data-active={activePage === item.id}
                variant={activePage === item.id ? "secondary" : "ghost"} onClick={() => setActivePage(item.id)}>
                <Icon aria-hidden="true" className="size-4" />{t(item.title)}
              </Button>
            );
          })}
          {visibleNavigation.length === 0 && <p className="px-2 text-xs text-muted-foreground">{translate("settings:navigation.empty")}</p>}
        </nav>
      </aside>
      <section className="navo-settings-content" aria-label={t(settingsNavigation.find((item) => item.id === activePage)?.title ?? "settings:title")}>
        <div className="mx-auto w-full max-w-[760px]">
          {activePage === "general" && <GeneralSettingsPage settings={settings} updateSettings={updateSettings} />}
          {activePage === "resources" && <ResourcesSettingsPage settings={settings} />}
          {activePage === "integrations" && <IntegrationsSettingsPage />}
          {activePage === "appearance" && <>
            <SettingsPageHeader title={translate("settings:pages.appearance")} />
            <AppearanceThemeSettings settings={settings} updateSettings={updateSettings} />
            <DiffAppearanceSettings resolvedTheme={resolvedTheme} settings={settings} updateSettings={updateSettings} />
          </>}
          {activePage === "about" && <AboutSettingsPage />}
        </div>
      </section>
    </div>
  );
}
