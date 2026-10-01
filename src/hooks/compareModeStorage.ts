import type { CompareMode } from "@/domain/types";

const COMPARE_MODE_STORAGE_KEY = "navo:compare-mode";
const LEGACY_COMPARE_MODE_STORAGE_KEY = "vibe-reviewer:compare-mode";

const COMPARE_MODES = new Set<CompareMode>(["unstaged", "staged", "branch"]);

/** 同一渲染进程内 HMR 重挂载后恢复当前实时对比方式。 */
let memoryCompareMode: CompareMode | null = null;

export function readStoredCompareMode(): CompareMode {
  if (memoryCompareMode && COMPARE_MODES.has(memoryCompareMode)) {
    return memoryCompareMode;
  }

  try {
    const stored = sessionStorage.getItem(COMPARE_MODE_STORAGE_KEY) ?? sessionStorage.getItem(LEGACY_COMPARE_MODE_STORAGE_KEY);
    if (stored && COMPARE_MODES.has(stored as CompareMode)) {
      memoryCompareMode = stored as CompareMode;
      return memoryCompareMode;
    }
  } catch {
    // sessionStorage 不可用时退回默认值。
  }

  return "unstaged";
}

export function writeStoredCompareMode(mode: CompareMode) {
  if (!COMPARE_MODES.has(mode)) {
    return;
  }

  memoryCompareMode = mode;

  try {
    sessionStorage.setItem(COMPARE_MODE_STORAGE_KEY, mode);
  } catch {
    // 忽略私密模式等存储失败。
  }
}
