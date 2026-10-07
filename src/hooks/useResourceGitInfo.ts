import { useEffect, useState } from "react";
import type { ResourceGitInfo } from "@/shared/settingsTypes";
import { getCachedResourceGitInfo, loadResourceGitInfo } from "@/services/resourceGitInfoCache";

export function useResourceGitInfo(localPath: string) {
  const path = localPath.trim();
  const [snapshot, setSnapshot] = useState<{ path: string; info: ResourceGitInfo | null; error: unknown }>(() => ({ path, info: getCachedResourceGitInfo(path), error: null }));
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (!path) return;
      try {
        const info = await loadResourceGitInfo(path);
        if (!cancelled) setSnapshot({ path, info, error: null });
      } catch (error) {
        if (!cancelled) setSnapshot({ path, info: getCachedResourceGitInfo(path), error });
      }
    }
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { cancelled = true; window.removeEventListener("focus", refresh); };
  }, [path]);
  const current = snapshot.path === path ? snapshot : { info: getCachedResourceGitInfo(path), error: null };
  return { info: current.info, error: current.info ? null : current.error };
}
