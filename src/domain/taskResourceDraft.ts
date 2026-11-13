import type { AppSettings } from "./types";
import type { TaskResourceInfo, TaskResourceInput } from "@/shared/taskTypes";

export interface TaskResourceDraft extends TaskResourceInput {
  /** 同一仓库可配置多次，行身份不再使用全局仓库 ID。 */
  draftId: string;
  /** 选择时探测到的目录与 Git 信息；提交时主进程再次校验。 */
  info: TaskResourceInfo;
}

export function createTaskResourceDraft(info: TaskResourceInfo, mode: AppSettings["defaultTaskMode"]): TaskResourceDraft {
  return {
    draftId: crypto.randomUUID(), info, resourceId: info.resourceId, mode: info.git ? mode : "folder",
    sourceBranch: info.git && mode === "current-branch"
      ? info.git.currentBranch ? `refs/heads/${info.git.currentBranch}` : "HEAD"
      : info.git?.defaultSource ?? "",
    targetBranch: "",
  };
}

export function mergeTaskResourceDrafts(current: TaskResourceDraft[], additions: TaskResourceDraft[], replacingId?: string) {
  const candidates = replacingId ? current.flatMap((resource) => resource.draftId === replacingId ? additions : [resource]) : [...current, ...additions];
  const result: TaskResourceDraft[] = [];
  for (const draft of candidates) {
    const slot = draftSlot(draft);
    const index = slot ? result.findIndex((item) => draftSlot(item) === slot) : -1;
    if (index < 0) result.push(draft);
    else result[index] = draft;
  }
  return result;
}

function draftSlot(draft: TaskResourceDraft) {
  const root = draft.info.git?.root ?? draft.info.path;
  if (draft.mode !== "worktree") return `directory:${root}`;
  if (draft.useExistingBranch) return `branch:${root}:${draft.sourceBranch}`;
  return draft.targetBranch.trim() ? `branch:${root}:refs/heads/${draft.targetBranch.trim()}` : null;
}
