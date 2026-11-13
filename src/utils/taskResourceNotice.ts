import type { TaskResourceInput } from "../shared/taskTypes";
import type { TaskResourceDraft } from "../domain/taskResourceDraft";

export type AddedTaskResource = TaskResourceInput & { repositoryId?: string };

export function taskResourceNotice(repositoryId: string, draft: TaskResourceDraft | null | undefined, added: AddedTaskResource[]): "repo" | "branch" | undefined {
  const matches = added.filter((resource) => (resource.repositoryId ?? resource.resourceId) === repositoryId);
  if (!matches.length) return undefined;
  if (draft?.mode === "current-branch" && matches.some((resource) => resource.mode !== "worktree")) return "branch";
  if (draft?.useExistingBranch) {
    const branch = draft.sourceBranch.replace(/^refs\/heads\//, "").replace(/^refs\/remotes\/[^/]+\//, "");
    if (matches.some((resource) => (resource.targetBranch || (resource.useExistingBranch ? resource.sourceBranch : "")).replace(/^refs\/heads\//, "") === branch)) return "branch";
  }
  return "repo";
}
