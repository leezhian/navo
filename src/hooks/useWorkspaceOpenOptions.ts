import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceOpenOptions } from "@/shared/workspaceOpenTypes";
import { cachedWorkspaceOptions, invalidateWorkspaceOptions, loadWorkspaceOptions, workspaceOptionsKey } from "@/services/workspaceOpenOptions";

/** 仅进入工作台或回到前台时检查过期缓存；展开菜单不执行查询。 */
export function useWorkspaceOpenOptions(taskId: string, resourceId: string, workingPath: string, enabled: boolean) {
  const key = workspaceOptionsKey(taskId, resourceId, workingPath);
  const [snapshot, setSnapshot] = useState<{ key: string; options: WorkspaceOpenOptions | null } | null>(null);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const current = ++revision.current;
    const options = await loadWorkspaceOptions(key, taskId, resourceId);
    if (current === revision.current) setSnapshot({ key, options });
  }, [taskId, resourceId, key, enabled]);
  useEffect(() => {
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { revision.current += 1;window.removeEventListener("focus", refresh); };
  }, [refresh]);
  const options = enabled ? snapshot?.key === key ? snapshot.options : cachedWorkspaceOptions(key) : null;
  return { options, refreshAfterFailure: () => { invalidateWorkspaceOptions(key);void refresh(); } };
}
