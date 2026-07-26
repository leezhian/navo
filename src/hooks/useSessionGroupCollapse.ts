import { useState } from "react";

const STORAGE_KEY = "vibe-reviewer:session-group-collapse";

/** 会话栏项目分组的折叠状态，按项目路径持久化到 localStorage，重启后保留。 */
export function useSessionGroupCollapse() {
  const [collapsedProjectPaths, setCollapsedProjectPaths] = useState<Set<string>>(readStoredCollapsedPaths);

  function toggleGroup(projectPath: string) {
    const next = new Set(collapsedProjectPaths);
    if (next.has(projectPath)) {
      next.delete(projectPath);
    } else {
      next.add(projectPath);
    }
    writeStoredCollapsedPaths(next);
    setCollapsedProjectPaths(next);
  }

  return {
    collapsedProjectPaths,
    toggleGroup,
  };
}

function readStoredCollapsedPaths(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return new Set();
    }
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((item): item is string => typeof item === "string"));
    }
  } catch {
    // localStorage 不可用或内容损坏时退回全部展开。
  }
  return new Set();
}

function writeStoredCollapsedPaths(paths: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...paths]));
  } catch {
    // 忽略私密模式等存储失败，仅影响下次启动的折叠记忆。
  }
}
