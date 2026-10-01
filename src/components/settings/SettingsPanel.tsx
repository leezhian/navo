import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Info, Palette, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AboutSettingsPage } from "./AboutSettingsPage";
import { AppearanceThemeSettings } from "./AppearanceThemeSettings";
import { DiffAppearanceSettings } from "./DiffAppearanceSettings";
import { SettingsPageHeader } from "./settingsPrimitives";
import type { AppSettings, ResolvedTheme } from "@/domain/types";

type SettingsPage = "appearance" | "about";
const settingsNavigation = [
  { id: "appearance" as const, title: "外观", icon: Palette },
  { id: "about" as const, title: "关于", icon: Info },
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
  const [activePage, setActivePage] = useState<SettingsPage>("appearance");
  const [searchKeyword, setSearchKeyword] = useState("");
  const visibleNavigation = settingsNavigation.filter((item) => item.title.includes(searchKeyword.trim()));

  return (
    <div className="navo-settings-workspace">
      <aside className="navo-settings-navigation" aria-label="设置分类">
        <div className="relative mb-4">
          <Search aria-hidden="true" className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
          <Input aria-label="搜索设置" className="h-8 pl-8 text-xs" placeholder="搜索设置…" value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} />
        </div>
        <nav className="flex flex-col gap-1">
          {visibleNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <Button key={item.id} aria-pressed={activePage === item.id} className="justify-start gap-2 font-normal" data-active={activePage === item.id}
                variant={activePage === item.id ? "secondary" : "ghost"} onClick={() => setActivePage(item.id)}>
                <Icon aria-hidden="true" className="size-4" />{item.title}
              </Button>
            );
          })}
          {visibleNavigation.length === 0 && <p className="px-2 text-xs text-muted-foreground">没有匹配的设置项</p>}
        </nav>
      </aside>
      <section className="navo-settings-content" aria-label={activePage === "appearance" ? "外观设置" : "关于 Navo"}>
        <div className="mx-auto w-full max-w-[820px]">
          {activePage === "appearance" && <>
            <SettingsPageHeader title="外观" />
            <AppearanceThemeSettings resolvedTheme={resolvedTheme} settings={settings} updateSettings={updateSettings} />
            <DiffAppearanceSettings settings={settings} updateSettings={updateSettings} />
          </>}
          {activePage === "about" && <AboutSettingsPage />}
        </div>
      </section>
    </div>
  );
}
