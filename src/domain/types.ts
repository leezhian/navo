export type AgentType = "Claude Code" | "Codex" | "OpenCode" | "Qoder";

export type CompareMode = "unstaged" | "staged" | "branch" | "previous-session";

export type DiffViewMode = "unified" | "split";

export type ReadingMode = "continuous" | "single-file";

export type ThemePreference = "system" | "light" | "dark";

export type FileStatus = "added" | "modified" | "deleted" | "renamed" | "binary";

export type AgentStatus = "listening" | "disabled" | "failed";

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
  hasBaseline: boolean;
}

export interface AppSettings {
  enabledAgents: Record<AgentType, boolean>;
  agentStatuses: Record<AgentType, AgentStatus>;
  theme: ThemePreference;
  diffViewMode: DiffViewMode;
  wrapDiffLines: boolean;
  readingMode: ReadingMode;
  targetBranch: string;
}

export interface DiffLine {
  id: string;
  type: "context" | "add" | "delete";
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
}

export interface DiffHunk {
  id: string;
  oldStart: number;
  newStart: number;
  header: string;
  lines: DiffLine[];
  leadingContext: number;
  trailingContext: number;
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
  hunks: DiffHunk[];
}

export interface ReviewSummary {
  files: DiffFile[];
  additions: number;
  deletions: number;
  fileCount: number;
  isLargeDiff: boolean;
}

