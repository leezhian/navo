import type { CompareMode, ReviewSession } from "@/domain/types";

/** 工作区会变化的对比方式：需要文件监听与自动软刷新。 */
export function isLiveCompareMode(mode: CompareMode) {
  return mode === "unstaged" || mode === "staged" || mode === "branch";
}

/** 工具栏需要展示文件数的对比方式。 */
export function isTrackedFileCountMode(mode: CompareMode) {
  return mode === "unstaged" || mode === "staged";
}

/** 同一实时审查范围内保留文件选中和折叠状态。 */
export function getReviewScopeKey(session: ReviewSession, compareMode: CompareMode, targetBranch: string) {
  return `${session.id}:${compareMode}:${targetBranch}`;
}

/** 项目路径、实时对比方式或目标分支变化时重新全量加载。 */
export function getHardReloadKey(
  session: ReviewSession | null,
  compareMode: CompareMode,
  targetBranch: string,
) {
  if (!session) {
    return null;
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
