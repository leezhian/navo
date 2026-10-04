import type { FileDiffMetadata } from "@pierre/diffs";
import type { AppLocale } from "../shared/locales";

/** 历史会话的 Agent 来源，顺序即筛选菜单的展示顺序。 */
export const AGENT_TYPES = ["Claude Code", "ChatGPT", "OpenCode", "Qoder"] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export type ReviewProvider = "claude" | "codex";

export type CompareMode = "unstaged" | "staged" | "branch";

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

export type ReviewFileAction = "restore-worktree" | "restore-file" | "stage" | "unstage";

export type ReviewBatchFileAction = "restore-worktree-all" | "stage-all" | "unstage-all";

export interface ReviewSession {
  id: string;
  agent: AgentType;
  /** 会话标题：取首轮用户 prompt 首行，生成后保持不变；历史数据可能缺失。 */
  title?: string;
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
  /** 界面语言，首次使用默认英文。 */
  locale: AppLocale;
  /** 新克隆和未来 worktree 的默认位置，支持用户目录缩写。 */
  repositoriesDirectory: string;
  worktreesDirectory: string;
  /** 保存默认策略，实际任务创建能力接入后消费。 */
  defaultTaskMode: "worktree" | "new-branch" | "current-branch";
  branchPrefix: string;
  /** Agent 生命周期尚未接入，本阶段只保存偏好。 */
  keepAwakeDuringAgent: boolean;
  /** 诊断日志文件位置；空值使用应用用户目录下的默认日志。 */
  logFilePath: string;
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
