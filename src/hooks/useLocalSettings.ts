import { useEffect, useMemo, useState } from "react";
import type { ResolvedTheme, ThemePreference } from "../domain/types";
import { useSettingsStore } from "@/stores/settingsStore";

const SYSTEM_COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export function useLocalSettings() {
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.update);
  const bootstrap = useSettingsStore((state) => state.bootstrap);
  const [isSystemDark, setIsSystemDark] = useState(() => getIsSystemDark());
  const resolvedTheme = resolveTheme(settings.theme, isSystemDark);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const colorSchemeQuery = window.matchMedia(SYSTEM_COLOR_SCHEME_QUERY);
    const handleSystemThemeChange = () => setIsSystemDark(colorSchemeQuery.matches);

    handleSystemThemeChange();

    if (settings.theme !== "system") {
      return undefined;
    }

    // 跟随系统时 settings.theme 不会变化，需要订阅系统主题事件来同步 resolvedTheme。
    colorSchemeQuery.addEventListener("change", handleSystemThemeChange);

    return () => colorSchemeQuery.removeEventListener("change", handleSystemThemeChange);
  }, [settings.theme]);

  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  return useMemo(
    () => ({
      resolvedTheme,
      settings,
      updateSettings,
    }),
    [resolvedTheme, settings, updateSettings],
  );
}

function applyResolvedTheme(resolvedTheme: ResolvedTheme) {
  const root = document.documentElement;

  root.classList.toggle("dark", resolvedTheme === "dark");
  root.style.colorScheme = resolvedTheme;
}

function resolveTheme(theme: ThemePreference, isSystemDark: boolean): ResolvedTheme {
  if (theme !== "system") {
    return theme;
  }

  return isSystemDark ? "dark" : "light";
}

function getIsSystemDark() {
  return window.matchMedia(SYSTEM_COLOR_SCHEME_QUERY).matches;
}
