import { useEffect, useMemo, useState } from "react";
import { defaultSettings } from "../domain/mockData";
import type { AppSettings, ThemePreference } from "../domain/types";

const STORAGE_KEY = "vibe-reviewer-settings";

export function useLocalSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => readSettings());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolveTheme(settings.theme) === "dark");
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

function resolveTheme(theme: ThemePreference) {
  if (theme !== "system") {
    return theme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
