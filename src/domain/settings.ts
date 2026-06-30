import type { AppSettings, DiffIndicatorMode, DiffThemePreset } from "./types";

export const DIFF_UI_FONT_SIZE_LIMITS = {
  max: 22,
  min: 11,
};

export const DIFF_CODE_FONT_SIZE_LIMITS = {
  max: 22,
  min: 10,
};

export const diffIndicatorOptions: Array<{ label: string; value: DiffIndicatorMode }> = [
  {
    label: "颜色",
    value: "color",
  },
  {
    label: "+/-",
    value: "symbols",
  },
];

export const diffThemeOptions: Array<{ label: string; value: DiffThemePreset }> = [
  {
    label: "Pierre",
    value: "codex",
  },
  {
    label: "GitHub",
    value: "github",
  },
];

export const diffThemePresetMap: Record<DiffThemePreset, { dark: string; light: string }> = {
  codex: {
    dark: "pierre-dark",
    light: "pierre-light",
  },
  github: {
    dark: "github-dark",
    light: "github-light",
  },
};

export function normalizeAppSettings(value: AppSettings): AppSettings {
  return {
    ...value,
    diffCodeFontSize: clampNumber(
      value.diffCodeFontSize,
      defaultDiffSettings.diffCodeFontSize,
      DIFF_CODE_FONT_SIZE_LIMITS,
    ),
    diffIndicatorMode: isDiffIndicatorMode(value.diffIndicatorMode) ? value.diffIndicatorMode : "color",
    diffLightTheme: isDiffThemePreset(value.diffLightTheme) ? value.diffLightTheme : "codex",
    diffDarkTheme: isDiffThemePreset(value.diffDarkTheme) ? value.diffDarkTheme : "codex",
    diffUiFontSize: clampNumber(value.diffUiFontSize, defaultDiffSettings.diffUiFontSize, DIFF_UI_FONT_SIZE_LIMITS),
  };
}

type DiffSettings = Pick<
  AppSettings,
  "diffCodeFontSize" | "diffDarkTheme" | "diffIndicatorMode" | "diffLightTheme" | "diffUiFontSize"
>;

export const defaultDiffSettings: DiffSettings = {
  diffCodeFontSize: 12,
  diffDarkTheme: "codex",
  diffIndicatorMode: "color",
  diffLightTheme: "codex",
  diffUiFontSize: 14,
};

function clampNumber(
  value: number | undefined,
  fallback: number,
  limits: { max: number; min: number },
) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(value), limits.min), limits.max);
}

function isDiffIndicatorMode(value: unknown): value is DiffIndicatorMode {
  return value === "color" || value === "symbols";
}

function isDiffThemePreset(value: unknown): value is DiffThemePreset {
  return value === "codex" || value === "github";
}
