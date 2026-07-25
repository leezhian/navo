import type { CompareMode, ReviewSession } from "@/domain/types";

/** 工作区会变化的对比方式：需要文件监听与自动软刷新。 */
export function isLiveCompareMode(mode: CompareMode) {
  return mode === "unstaged" || mode === "staged" || mode === "branch";
}

/** 工具栏需要展示文件数的对比方式。 */
export function isTrackedFileCountMode(mode: CompareMode) {
  return mode === "unstaged" || mode === "staged";
}

/**
 * 同一「审查范围」内保留选中/折叠状态。
 * previous-session 跟 agent 快照绑定，故把 updatedAt / rawDiffPath 纳入 key。
 */
export function getReviewScopeKey(session: ReviewSession, compareMode: CompareMode, targetBranch: string) {
  if (compareMode === "previous-session") {
    return `${session.id}:${compareMode}:${session.updatedAt}:${session.rawDiffPath ?? ""}`;
  }

  return `${session.id}:${compareMode}:${targetBranch}`;
}

/**
 * 硬刷新依赖键：变化时重新全量加载。
 * live 模式跟项目路径与目标分支；previous-session 只跟会话快照。
 */
export function getHardReloadKey(
  session: ReviewSession | null,
  compareMode: CompareMode,
  targetBranch: string,
) {
  if (!session) {
    return null;
  }

  if (compareMode === "previous-session") {
    return `${session.id}|previous-session|${session.updatedAt}|${session.rawDiffPath ?? ""}`;
  }

  return `${session.id}|${compareMode}|${session.projectPath}|${targetBranch}`;
}

/** 比较项目路径，容忍尾斜杠与大小写差异。 */
export function pathsMatch(left: string, right: string) {
  return normalizePath(left) === normalizePath(right);
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}
