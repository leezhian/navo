/** 任务工作台布局：按任务保存在本机，跨重启恢复；不驱动会话或终端进程。 */
export interface TaskWorkspaceLayout {
  railWidth: number;
  rightWidth: number;
  terminalHeight: number;
  contextOpen: boolean;
  /** false 表示右侧栏已收起；true 表示展开（分支或笔记）。 */
  rightOpen: boolean;
  terminalOpen: boolean;
  /** 终端是否最大化占满主区。 */
  expanded: boolean;
}

const STORAGE_KEY = "navo:task-workspace-layouts";
const DEFAULT_LAYOUT: TaskWorkspaceLayout = {
  railWidth: 216,
  rightWidth: 326,
  terminalHeight: 192,
  contextOpen: true,
  rightOpen: true,
  terminalOpen: false,
  expanded: false,
};

const RAIL_MIN = 160;
const RAIL_MAX = 300;
const RIGHT_MIN = 268;
const RIGHT_MAX = 540;
const TERMINAL_MIN = 100;
const TERMINAL_MAX = 400;

export function defaultTaskWorkspaceLayout(): TaskWorkspaceLayout {
  return { ...DEFAULT_LAYOUT };
}

export function readTaskWorkspaceLayout(taskId: string): TaskWorkspaceLayout | null {
  const all = readAll();
  const stored = all[taskId];
  return stored ? normalizeLayout(stored) : null;
}

export function writeTaskWorkspaceLayout(taskId: string, layout: TaskWorkspaceLayout) {
  try {
    const all = readAll();
    all[taskId] = normalizeLayout(layout);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // 私密模式或配额满时忽略，不阻断工作台交互。
  }
}

function readAll(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeLayout(value: unknown): TaskWorkspaceLayout {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    railWidth: clampNumber(source.railWidth, DEFAULT_LAYOUT.railWidth, RAIL_MIN, RAIL_MAX),
    rightWidth: clampNumber(source.rightWidth, DEFAULT_LAYOUT.rightWidth, RIGHT_MIN, RIGHT_MAX),
    terminalHeight: clampNumber(source.terminalHeight, DEFAULT_LAYOUT.terminalHeight, TERMINAL_MIN, TERMINAL_MAX),
    contextOpen: source.contextOpen !== false,
    rightOpen: source.rightOpen !== false,
    terminalOpen: source.terminalOpen === true,
    expanded: source.expanded === true,
  };
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), min), max);
}
