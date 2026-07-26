import { useEffect, useMemo, useState } from "react";
import { defaultSettings, normalizeAppSettings } from "../domain/settings";
import type { AppSettings, ResolvedTheme, ThemePreference } from "../domain/types";
import { loadAgentIntegrationStatuses } from "../services/reviewApi";

const STORAGE_KEY = "vibe-reviewer-settings";
const SYSTEM_COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export function useLocalSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => readSettings());
  const [isSystemDark, setIsSystemDark] = useState(() => getIsSystemDark());
  const resolvedTheme = resolveTheme(settings.theme, isSystemDark);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

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

  useEffect(() => {
    let isMounted = true;

    loadAgentIntegrationStatuses()
      .then((agentStatuses) => {
        if (!isMounted || Object.keys(agentStatuses).length === 0) {
          return;
        }

        setSettings((current) => {
          const enabledAgents = { ...current.enabledAgents };

          for (const [agent, status] of Object.entries(agentStatuses)) {
            enabledAgents[agent as keyof typeof enabledAgents] = status === "listening";
          }

          return {
            ...current,
            enabledAgents,
            agentStatuses: {
              ...current.agentStatuses,
              ...agentStatuses,
            },
          };
        });
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);

  return useMemo(
    () => ({
      resolvedTheme,
      settings,
      updateSettings: setSettings,
    }),
    [resolvedTheme, settings],
  );
}

function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultSettings;
    }

    return normalizeAppSettings({
      ...defaultSettings,
      ...JSON.parse(raw),
    });
  } catch {
    return defaultSettings;
  }
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
