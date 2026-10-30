import { randomBytes } from "node:crypto";
import path from "node:path";
import { pathExists } from "./taskDeletionGit";
import { generateTaskBranch } from "./taskGit";
import type { WorkspaceStep } from "./taskWorkspaces";

const WORKTREE_ID_LENGTH = 8;

/** 自动分支复用其随机后缀；手动或已有分支另取目录 ID，不修改分支名。 */
export async function assignWorktreePath(step: WorkspaceStep, root: string, occupiedPaths: string[] = []) {
  const name = step.resource.name.replace(/[^\p{L}\p{N}._-]/gu, "-").slice(0, 48).replace(/^\.+/, "") || "repo";
  const followsBranch = step.automaticTarget && !step.resource.useExistingBranch;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (attempt > 0 && followsBranch) step.resource.targetBranch = await generateTaskBranch(step.repository, step.branchPrefix);
    // 目录只复用末尾随机 ID，不带设置前缀及分支名中的 navo-task-。
    const suffix = followsBranch ? step.resource.targetBranch.slice(-WORKTREE_ID_LENGTH) : randomBytes(4).toString("hex");
    const directory = path.join(root, name + "-" + suffix);
    if (occupiedPaths.includes(directory) || await pathExists(directory)) continue;
    step.resource.workingPath = directory;
    return;
  }
  throw new Error("TASK_RESOURCE_CHANGED");
}
