import { useEffect, useMemo, useState } from "react";
import { defaultSettings } from "../domain/mockData";
import type { AppSettings, ThemePreference } from "../domain/types";

const STORAGE_KEY = "vibe-reviewer-settings";
const SYSTEM_COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export function useLocalSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => readSettings());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const colorSchemeQuery = window.matchMedia(SYSTEM_COLOR_SCHEME_QUERY);
    const applyTheme = () => applyThemePreference(settings.theme, colorSchemeQuery.matches);

    applyTheme();

    if (settings.theme !== "system") {
      return undefined;
    }

    // 跟随系统时 settings.theme 不会变化，需要订阅系统主题事件来刷新根节点 class。
    colorSchemeQuery.addEventListener("change", applyTheme);

    return () => colorSchemeQuery.removeEventListener("change", applyTheme);
  }, [settings.theme]);

  return useMemo(
    () => ({
      settings,
      updateSettings: setSettings,
    }),
    [settings],
  );
}

function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultSettings;
    }

    return {
      ...defaultSettings,
      ...JSON.parse(raw),
    };
  } catch {
    return defaultSettings;
  }
}

function applyThemePreference(theme: ThemePreference, isSystemDark: boolean) {
  const root = document.documentElement;
  const resolvedTheme = resolveTheme(theme, isSystemDark);

  root.classList.toggle("dark", resolvedTheme === "dark");
  root.style.colorScheme = resolvedTheme;
}

function resolveTheme(theme: ThemePreference, isSystemDark: boolean) {
  if (theme !== "system") {
    return theme;
  }

  return isSystemDark ? "dark" : "light";
}
