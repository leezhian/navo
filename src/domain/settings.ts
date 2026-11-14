import type { AppSettings, DiffDarkThemePreset, DiffIndicatorMode, DiffLightThemePreset, NotificationChannel, NotificationPreferences } from "./types";
import { DEFAULT_LOCALE, normalizeLocale } from "../shared/locales";
import type { TranslationKey } from "../i18n/types";
import { normalizeWorkspaceOpenTarget } from "../utils/workspaceOpenTarget";

export const DIFF_UI_FONT_SIZE_LIMITS = {
  max: 22,
  min: 11,
};

export const DIFF_CODE_FONT_SIZE_LIMITS = {
  max: 22,
  min: 10,
};

export const diffIndicatorOptions: Array<{ label: TranslationKey<"settings">; value: DiffIndicatorMode }> = [
  {
    label: "settings:appearance.diff.indicatorColor",
    value: "color",
  },
  {
    label: "settings:appearance.diff.indicatorSymbols",
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

/** 新安装按「需要我时才打扰」：回复默认关闭，权限和错误默认开。 */
export const defaultNotificationPreferences: NotificationPreferences = {
  replies: { desktop: false, inApp: false },
  questions: { desktop: true, inApp: true },
  permissions: { desktop: true, inApp: true },
  approvals: { desktop: true, inApp: true },
  errors: { desktop: true, inApp: true },
  sound: true,
  includeForeground: false,
};

type LegacyNotificationSettings = Partial<AppSettings> & {
  sessionNotifyReplies?: boolean;
  sessionNotifyPermissions?: boolean;
  sessionNotifyFailures?: boolean;
};

function normalizeChannel(value: unknown, fallback: NotificationChannel, legacyDesktop?: boolean): NotificationChannel {
  if (value && typeof value === "object") {
    const channel = value as Partial<NotificationChannel>;
    return {
      desktop: typeof channel.desktop === "boolean" ? channel.desktop : fallback.desktop,
      inApp: typeof channel.inApp === "boolean" ? channel.inApp : fallback.inApp,
    };
  }
  if (typeof legacyDesktop === "boolean") return { desktop: legacyDesktop, inApp: fallback.inApp };
  return fallback;
}

/** 旧的三项总开关只映射到桌面通道，应用内沿用当前默认。 */
function normalizeNotifications(value: LegacyNotificationSettings): NotificationPreferences {
  const stored = value.notifications;
  return {
    replies: normalizeChannel(stored?.replies, defaultNotificationPreferences.replies, value.sessionNotifyReplies),
    questions: normalizeChannel(stored?.questions, defaultNotificationPreferences.questions),
    permissions: normalizeChannel(stored?.permissions, defaultNotificationPreferences.permissions, value.sessionNotifyPermissions),
    approvals: normalizeChannel(stored?.approvals, defaultNotificationPreferences.approvals),
    errors: normalizeChannel(stored?.errors, defaultNotificationPreferences.errors, value.sessionNotifyFailures),
    sound: typeof stored?.sound === "boolean" ? stored.sound : defaultNotificationPreferences.sound,
    includeForeground: stored?.includeForeground === true,
  };
}

export function normalizeAppSettings(value: Partial<AppSettings>): AppSettings {
  return {
    lastWorkspaceOpenTarget: normalizeWorkspaceOpenTarget(value.lastWorkspaceOpenTarget),
    locale: normalizeLocale(value.locale),
    repositoriesDirectory: normalizePath(value.repositoriesDirectory, "~/navo/repos"),
    worktreesDirectory: normalizePath(value.worktreesDirectory, "~/navo/worktrees"),
    tasksDirectory: normalizePath(value.tasksDirectory, "~/navo/tasks"),
    defaultTaskMode: value.defaultTaskMode === "new-branch" || value.defaultTaskMode === "current-branch" ? value.defaultTaskMode : "worktree",
    branchPrefix: typeof value.branchPrefix === "string" ? value.branchPrefix.trim() : "navo/",
    keepAwakeDuringAgent: value.keepAwakeDuringAgent === true,
    notifications: normalizeNotifications(value),
    logFilePath: normalizePath(value.logFilePath, ""),
    theme: value.theme === "light" || value.theme === "dark" ? value.theme : "system",
    diffViewMode: value.diffViewMode === "unified" ? "unified" : "split",
    wrapDiffLines: value.wrapDiffLines === true,
    readingMode: value.readingMode === "single-file" ? "single-file" : "continuous",
    targetBranch: typeof value.targetBranch === "string" ? value.targetBranch : "origin/main",
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

const defaultDiffSettings: DiffSettings = {
  diffCodeFontSize: 12,
  diffDarkTheme: "pierre-dark",
  diffIndicatorMode: "color",
  diffLightTheme: "pierre-light",
  diffUiFontSize: 14,
};

/** 应用默认配置：本地无存储或解析失败时的兜底，也是新安装后的初始值。 */
export const defaultSettings: AppSettings = {
  lastWorkspaceOpenTarget: { kind: "fileManager" },
  ...defaultDiffSettings,
  locale: DEFAULT_LOCALE,
  repositoriesDirectory: "~/navo/repos",
  worktreesDirectory: "~/navo/worktrees",
  tasksDirectory: "~/navo/tasks",
  defaultTaskMode: "worktree",
  branchPrefix: "navo/",
  keepAwakeDuringAgent: false,
  notifications: defaultNotificationPreferences,
  logFilePath: "",
  theme: "system",
  diffViewMode: "split",
  wrapDiffLines: false,
  enableTextDiff: true,
  readingMode: "continuous",
  targetBranch: "origin/main",
};

function normalizePath(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clampNumber(
  value: number | undefined,
  fallback: number,
  limits: { max: number; min: number },
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
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
