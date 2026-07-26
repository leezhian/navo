import type { FileDiffMetadata } from "@pierre/diffs";

/** 全部支持的 Agent 类型，顺序即设置页与筛选菜单的展示顺序；AgentType 由该列表推导，二者不会漂移。 */
export const AGENT_TYPES = ["Claude Code", "Codex", "OpenCode", "Qoder"] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export type ReviewProvider = "claude" | "codex";

export type CompareMode = "unstaged" | "staged" | "branch" | "previous-session";

export type CompareModeFileCounts = Partial<Record<CompareMode, number>>;

export type DiffViewMode = "unified" | "split";

export type DiffIndicatorMode = "color" | "symbols";

export type DiffLightThemePreset =
  | "pierre-light"
  | "github-light"
  | "gruvbox-light-hard"
  | "light-plus"
  | "ayu-light"
  | "everforest-light"
  | "vitesse-light";

export type DiffDarkThemePreset =
  | "pierre-dark"
  | "github-dark"
  | "gruvbox-dark-hard"
  | "dark-plus"
  | "ayu-dark"
  | "everforest-dark"
  | "vitesse-dark";

export type ReadingMode = "continuous" | "single-file";

export type ThemePreference = "system" | "light" | "dark";

export type ResolvedTheme = Exclude<ThemePreference, "system">;

export type FileStatus = "added" | "modified" | "deleted" | "renamed" | "binary";

export type AgentStatus = "listening" | "disabled" | "failed";

export type ReviewFileAction = "restore-worktree" | "restore-file" | "stage" | "unstage";

export type ReviewBatchFileAction = "restore-worktree-all" | "stage-all" | "unstage-all";

export interface ReviewSession {
  id: string;
  agent: AgentType;
  projectPath: string;
  projectName: string;
  branchName: string;
  startedAt: string;
  endedAt: string;
  updatedAt: string;
  fileCount: number;
  additions: number;
  deletions: number;
  unread: boolean;
  rawDiffPath?: string;
}

export interface AppSettings {
  enabledAgents: Record<AgentType, boolean>;
  agentStatuses: Record<AgentType, AgentStatus>;
  theme: ThemePreference;
  diffViewMode: DiffViewMode;
  diffUiFontSize: number;
  diffCodeFontSize: number;
  diffIndicatorMode: DiffIndicatorMode;
  diffLightTheme: DiffLightThemePreset;
  diffDarkTheme: DiffDarkThemePreset;
  wrapDiffLines: boolean;
  /** 是否启用行内文字差异高亮；开启为 word-alt，关闭为 none。 */
  enableTextDiff: boolean;
  readingMode: ReadingMode;
  targetBranch: string;
}

export interface DiffFile {
  id: string;
  oldPath: string | null;
  newPath: string;
  displayPath: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  isBinary: boolean;
  isLarge: boolean;
  pierreFile: FileDiffMetadata;
}

export interface ReviewSummary {
  files: DiffFile[];
  additions: number;
  deletions: number;
  fileCount: number;
  isLargeDiff: boolean;
}

/**
 * 工作区提示信息：主 diff 只含 tracked 改动时，用于提示被跳过的未跟踪文件。
 */
export interface WorktreeChangeHint {
  /** 未跟踪文件数量（已应用 git exclude-standard）。 */
  untrackedCount: number;
}
