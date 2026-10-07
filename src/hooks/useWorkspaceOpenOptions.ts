import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceOpenOptions } from "@/shared/workspaceOpenTypes";
import { getTasksApi } from "@/services/taskApi";

/** 提前读取菜单；重新展开保留已有内容，IDE 的实际扫描由主进程缓存合并。 */
export function useWorkspaceOpenOptions(taskId: string, resourceId: string, workingPath: string, enabled: boolean) {
  const [options, setOptions] = useState<WorkspaceOpenOptions | null>(null);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const current = ++revision.current;
    try {
      const next = await getTasksApi().workspaceOpenOptions(taskId, resourceId);
      if (current === revision.current) setOptions(next);
    } catch { /* 读取失败保留已有选项，下次展开时重试，不在菜单中展示提示。 */ }
  }, [taskId, resourceId, workingPath, enabled]);
  useEffect(() => {
    setOptions(null);void refresh();
    return () => { revision.current += 1; };
  }, [refresh]);
  return { options, refresh };
}
