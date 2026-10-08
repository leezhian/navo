import type { AppSettings } from "./types";
import type { TaskResourceInfo, TaskResourceInput } from "@/shared/taskTypes";

export interface TaskResourceDraft extends TaskResourceInput {
  /** 选择时探测到的目录与 Git 信息；提交时主进程再次校验。 */
  info: TaskResourceInfo;
}

export function createTaskResourceDraft(info: TaskResourceInfo, mode: AppSettings["defaultTaskMode"]): TaskResourceDraft {
  return {
    info, resourceId: info.resourceId, mode: info.git ? mode : "folder",
    sourceBranch: info.git && mode === "current-branch"
      ? info.git.currentBranch ? `refs/heads/${info.git.currentBranch}` : "HEAD"
      : info.git?.defaultSource ?? "",
    targetBranch: "",
  };
}

export function mergeTaskResourceDrafts(current: TaskResourceDraft[], additions: TaskResourceDraft[], replacingId?: string) {
  const remaining = current.filter((resource) => resource.resourceId !== replacingId);
  const roots = [...remaining, ...additions].map(({ info }) => info.git?.root ?? info.path);
  if (new Set(roots).size !== roots.length) throw new Error("TASK_DUPLICATE_RESOURCE");
  return replacingId
    ? current.flatMap((resource) => resource.resourceId === replacingId ? additions : [resource])
    : [...remaining, ...additions];
}
