import { useRef, useState } from "react";
import type { TaskResource } from "@/shared/taskTypes";
import type { WorkspaceOpenTarget } from "@/shared/workspaceOpenTypes";
import { getTasksApi } from "@/services/taskApi";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorkspaceOpenOptions } from "./useWorkspaceOpenOptions";

/** 快捷按钮与右键菜单共用缓存和上次打开方式，不在展开菜单时扫描应用。 */
export function useWorkspaceOpenActions(taskId: string, resource: TaskResource, onError?: () => void) {
  const { options, refreshAfterFailure } = useWorkspaceOpenOptions(taskId, resource.resourceId, resource.workingPath, Boolean(onError));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  async function open(target: WorkspaceOpenTarget) {
    if (!onError || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      await getTasksApi().openWorkspace(taskId, resource.resourceId, target);
      const store = useSettingsStore.getState();
      const previous = store.settings.lastWorkspaceOpenTarget;
      if (previous.kind !== target.kind || (previous.kind === "editor" && target.kind === "editor" && previous.editorId !== target.editorId)) {
        store.update((settings) => ({ ...settings, lastWorkspaceOpenTarget: target }));
      }
    } catch { if (target.kind === "editor") refreshAfterFailure(); onError(); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return { options, open, busy, disabled: !onError || busy };
}
