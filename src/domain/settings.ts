import type { AppSettings, DiffDarkThemePreset, DiffIndicatorMode, DiffLightThemePreset } from "./types";

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

export const diffLightThemeOptions: Array<{ label: string; value: DiffLightThemePreset }> = [
  {
    label: "Pierre",
    value: "pierre-light",
  },
  {
    label: "GitHub",
    value: "github-light",
  },
  {
    label: "Gruvbox",
    value: "gruvbox-light-hard",
  },
  {
    label: "Light",
    value: "light-plus",
  },
  {
    label: "Ayu",
    value: "ayu-light",
  },
  {
    label: "Everforest",
    value: "everforest-light",
  },
  {
    label: "Vitesse",
    value: "vitesse-light",
  },
];

export const diffDarkThemeOptions: Array<{ label: string; value: DiffDarkThemePreset }> = [
  {
    label: "Pierre",
    value: "pierre-dark",
  },
  {
    label: "GitHub",
    value: "github-dark",
  },
  {
    label: "Gruvbox",
    value: "gruvbox-dark-hard",
  },
  {
    label: "Dark",
    value: "dark-plus",
  },
  {
    label: "Ayu",
    value: "ayu-dark",
  },
  {
    label: "Everforest",
    value: "everforest-dark",
  },
  {
    label: "Vitesse",
    value: "vitesse-dark",
  },
];

export function normalizeAppSettings(value: AppSettings): AppSettings {
  return {
    ...value,
    diffCodeFontSize: clampNumber(
      value.diffCodeFontSize,
      defaultDiffSettings.diffCodeFontSize,
      DIFF_CODE_FONT_SIZE_LIMITS,
    ),
    diffIndicatorMode: isDiffIndicatorMode(value.diffIndicatorMode) ? value.diffIndicatorMode : "color",
    diffLightTheme: normalizeDiffLightTheme(value.diffLightTheme),
    diffDarkTheme: normalizeDiffDarkTheme(value.diffDarkTheme),
    diffUiFontSize: clampNumber(value.diffUiFontSize, defaultDiffSettings.diffUiFontSize, DIFF_UI_FONT_SIZE_LIMITS),
    // 旧本地配置可能没有该字段，默认开启文字差异（word-alt）。
    enableTextDiff: value.enableTextDiff !== false,
  };
}

type DiffSettings = Pick<
  AppSettings,
  "diffCodeFontSize" | "diffDarkTheme" | "diffIndicatorMode" | "diffLightTheme" | "diffUiFontSize"
>;

export const defaultDiffSettings: DiffSettings = {
  diffCodeFontSize: 12,
  diffDarkTheme: "pierre-dark",
  diffIndicatorMode: "color",
  diffLightTheme: "pierre-light",
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

function normalizeDiffLightTheme(value: unknown): DiffLightThemePreset {
  if (value === "codex") {
    return "pierre-light";
  }

  if (value === "github") {
    return "github-light";
  }

  return isDiffLightThemePreset(value) ? value : defaultDiffSettings.diffLightTheme;
}

function normalizeDiffDarkTheme(value: unknown): DiffDarkThemePreset {
  if (value === "codex") {
    return "pierre-dark";
  }

  if (value === "github") {
    return "github-dark";
  }

  return isDiffDarkThemePreset(value) ? value : defaultDiffSettings.diffDarkTheme;
}

function isDiffLightThemePreset(value: unknown): value is DiffLightThemePreset {
  return diffLightThemeOptions.some((option) => option.value === value);
}

function isDiffDarkThemePreset(value: unknown): value is DiffDarkThemePreset {
  return diffDarkThemeOptions.some((option) => option.value === value);
}
