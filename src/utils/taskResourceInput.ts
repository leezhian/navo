import type { TaskResourceInput } from "../shared/taskTypes";

export function isTaskResourceInput(value: TaskResourceInput) {
  return value && typeof value.resourceId === "string" && typeof value.sourceBranch === "string" && typeof value.targetBranch === "string"
    && ["worktree", "new-branch", "current-branch", "folder"].includes(value.mode);
}
