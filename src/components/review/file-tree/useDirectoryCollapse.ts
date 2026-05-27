import { useState } from "react";

export function useDirectoryCollapse() {
  const [collapsedDirectoryIds, setCollapsedDirectoryIds] = useState<Set<string>>(new Set());

  function toggleDirectory(directoryId: string) {
    setCollapsedDirectoryIds((current) => {
      const next = new Set(current);
      if (next.has(directoryId)) {
        next.delete(directoryId);
      } else {
        next.add(directoryId);
      }
      return next;
    });
  }

  return {
    collapsedDirectoryIds,
    toggleDirectory,
  };
}
