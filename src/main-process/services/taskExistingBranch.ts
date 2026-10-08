import { realpath } from "node:fs/promises";
import type { WorkspaceStep } from "./taskWorkspaces";
import { gitValue, listTaskWorktrees, taskGit } from "./taskGit";

export async function prepareExistingBranch(step: WorkspaceStep) {
  const { resource, repository } = step;
  let branch = resource.sourceBranch.replace(/^refs\/heads\//, "");
  if (resource.sourceBranch.startsWith("refs/remotes/")) {
    const remoteBranch = resource.sourceBranch.slice("refs/remotes/".length);
    const remotes = (await taskGit(repository, ["remote"])).split("\n").sort((first, second) => second.length - first.length);
    const remote = remotes.find((name) => name && remoteBranch.startsWith(name + "/"));
    if (!remote) throw new Error("TASK_INVALID_SOURCE");
    branch = remoteBranch.slice(remote.length + 1);
  }
  if (!branch || branch.startsWith("-") || await gitValue(repository, ["check-ref-format", "--branch", branch]) === null) throw new Error("TASK_INVALID_SOURCE");
  resource.targetBranch = branch;
  const localCommit = await gitValue(repository, ["rev-parse", "--verify", "refs/heads/" + branch + "^{commit}"]);
  if (localCommit) {
    step.baseCommit = localCommit;
    step.existingBranch = true;
  }
  const worktrees = await listTaskWorktrees(repository);
  const checkout = worktrees.find((worktree) => worktree.branch === branch);
  if (checkout) {
    resource.workingPath = await realpath(checkout.path);
    resource.mode = checkout.isMain ? "current-branch" : "worktree";
    step.reused = true;
  }
}
