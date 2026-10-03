import { lstat, mkdir, rmdir } from "node:fs/promises";
import path from "node:path";
import type { TaskResource, TaskResourceInfo, TaskResourceInput } from "../../shared/taskTypes";
import { generateTaskBranch, gitValue, taskGit, validateNewBranch } from "./taskGit";

export interface WorkspaceStep {
  resource: TaskResource;
  repository: string;
  baseCommit: string;
  previousBranch: string;
  previousHead: string;
  branchCreated: boolean;
  worktreeCreated: boolean;
  checkedOut: boolean;
  automaticTarget: boolean;
  branchPrefix: string;
}

export interface TaskCreationManifest {
  workspaceDirectory: string;
  workspaceDirectoryOwned: boolean;
  attachmentDirectory: string;
  attachmentDirectoryOwned: boolean;
  steps: WorkspaceStep[];
}

export async function prepareWorkspace(info: TaskResourceInfo, input: TaskResourceInput, prefix: string, workspaceDirectory: string, index: number): Promise<WorkspaceStep> {
  const resource: TaskResource = { ...input, name: info.name, originalPath: info.path, workingPath: info.path };
  const step: WorkspaceStep = { resource, repository: info.git?.root ?? info.path, baseCommit: "", previousBranch: "", previousHead: "", branchCreated: false, worktreeCreated: false, checkedOut: false, automaticTarget: !input.targetBranch.trim(), branchPrefix: prefix };
  if (!info.git) {
    if (input.mode !== "folder") throw new Error("TASK_RESOURCE_CHANGED");
    resource.sourceBranch = "";
    resource.targetBranch = "";
    return step;
  }
  if (input.mode === "folder") throw new Error("TASK_RESOURCE_CHANGED");
  step.previousBranch = info.git.currentBranch;
  step.previousHead = await gitValue(step.repository, ["rev-parse", "--verify", "HEAD"]) ?? "";
  if (!step.previousHead) throw new Error("TASK_EMPTY_REPOSITORY");
  if (input.mode === "current-branch") {
    resource.sourceBranch = step.previousBranch || step.previousHead;
    resource.targetBranch = resource.sourceBranch;
    return step;
  }
  if (!info.git.branches.some((branch) => branch.ref === input.sourceBranch)) throw new Error("TASK_INVALID_SOURCE");
  step.baseCommit = await taskGit(step.repository, ["rev-parse", "--verify", input.sourceBranch + "^{commit}"]);
  resource.targetBranch = input.targetBranch.trim() || await generateTaskBranch(step.repository, prefix);
  await validateNewBranch(step.repository, resource.targetBranch);
  if (input.mode === "new-branch" && await taskGit(step.repository, ["status", "--porcelain"])) throw new Error("TASK_DIRTY_REPOSITORY");
  if (input.mode === "worktree") {
    const directoryName = info.name.replace(/[^\p{L}\p{N}._-]/gu, "-").slice(0, 48).replace(/^\.+/, "") || "repo";
    resource.workingPath = path.join(workspaceDirectory, directoryName + "-" + index);
  }
  return step;
}

export async function createWorkspace(step: WorkspaceStep, persist: () => Promise<void>) {
  const { resource } = step;
  if (resource.mode === "folder" || resource.mode === "current-branch") return;
  if (resource.mode === "new-branch") {
    if (await taskGit(step.repository, ["status", "--porcelain"])
      || await taskGit(step.repository, ["rev-parse", "HEAD"]) !== step.previousHead
      || (await gitValue(step.repository, ["symbolic-ref", "--quiet", "--short", "HEAD"]) ?? "") !== step.previousBranch) throw new Error("TASK_RESOURCE_CHANGED");
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await validateNewBranch(step.repository, resource.targetBranch);
      await taskGit(step.repository, ["branch", resource.targetBranch, step.baseCommit]);
      break;
    } catch (error) {
      const collision = await gitValue(step.repository, ["show-ref", "--verify", "--quiet", "refs/heads/" + resource.targetBranch]) !== null;
      if (!step.automaticTarget || !collision || attempt === 9) throw error;
      resource.targetBranch = await generateTaskBranch(step.repository, step.branchPrefix);
      await persist();
    }
  }
  step.branchCreated = true;
  await persist();
  if (resource.mode === "worktree") {
    await taskGit(step.repository, ["worktree", "add", resource.workingPath, resource.targetBranch]);
    step.worktreeCreated = true;
  } else {
    await taskGit(step.repository, ["switch", "--no-overwrite-ignore", resource.targetBranch]);
    step.checkedOut = true;
  }
  await persist();
}

async function exists(filePath: string) {
  try { await lstat(filePath); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** 只撤销已确认属于本次创建、且 HEAD 与工作区均未被用户改动的内容；不使用 --force。 */
export async function rollbackWorkspaces(manifest: TaskCreationManifest): Promise<boolean> {
  let retained = false;
  for (const step of [...manifest.steps].reverse()) {
    const { resource } = step;
    if (resource.mode === "folder" || resource.mode === "current-branch") continue;
    try {
      if (resource.mode === "worktree" && await exists(resource.workingPath)) {
        if (!step.worktreeCreated || (await lstat(resource.workingPath)).isSymbolicLink()
          || await taskGit(resource.workingPath, ["rev-parse", "HEAD"]) !== step.baseCommit
          || await taskGit(resource.workingPath, ["status", "--porcelain", "--untracked-files=all", "--ignored"])) { retained = true; continue; }
        await taskGit(step.repository, ["worktree", "remove", resource.workingPath]);
      }
      if (resource.mode === "new-branch") {
        const current = await gitValue(step.repository, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
        if (current === resource.targetBranch) {
          if (!step.checkedOut || await taskGit(step.repository, ["status", "--porcelain"])
            || await taskGit(step.repository, ["rev-parse", "HEAD"]) !== step.baseCommit) { retained = true; continue; }
          await taskGit(step.repository, step.previousBranch ? ["switch", "--no-overwrite-ignore", step.previousBranch] : ["switch", "--no-overwrite-ignore", "--detach", step.previousHead]);
        }
      }
      const ref = "refs/heads/" + resource.targetBranch;
      const head = await taskGit(step.repository, ["for-each-ref", "--format=%(objectname)", ref]);
      if (head) {
        const worktrees = await taskGit(step.repository, ["worktree", "list", "--porcelain"]);
        if (!step.branchCreated || head !== step.baseCommit || worktrees.split("\n").includes("branch " + ref)) { retained = true; continue; }
        await taskGit(step.repository, ["update-ref", "-d", ref, step.baseCommit]);
      }
    } catch { retained = true; }
  }
  if (manifest.workspaceDirectoryOwned) {
    try { await rmdir(manifest.workspaceDirectory); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") retained = true; }
  } else if (manifest.steps.some((step) => step.resource.mode === "worktree") && await exists(manifest.workspaceDirectory)) retained = true;
  return retained;
}

export async function createWorkspaceDirectory(manifest: TaskCreationManifest, persist: () => Promise<void>) {
  if (!manifest.steps.some((step) => step.resource.mode === "worktree")) return;
  await mkdir(path.dirname(manifest.workspaceDirectory), { recursive: true });
  await mkdir(manifest.workspaceDirectory);
  manifest.workspaceDirectoryOwned = true;
  await persist();
}
