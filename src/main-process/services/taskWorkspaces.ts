import { diagnosticOperation, writeDiagnosticEvent } from "../diagnostics/diagnosticLogger";
import { lstat, mkdir, realpath, rmdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { TaskResource, TaskResourceInfo, TaskResourceInput } from "../../shared/taskTypes";
import { generateTaskBranch, gitValue, taskGit, validateNewBranch } from "./taskGit";
import { prepareExistingBranch } from "./taskExistingBranch";
import { removeTaskWorktree } from "./taskWorktreeLock";
import { assignWorktreePath } from "./taskWorktreePath";

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
  /** 独占创建的空目录身份，Git 创建失败时只允许清理这一个目录。 */
  directoryReservation?: { path: string; id: string };
  /** 复用的目录不能由本次创建、回滚或删除操作认领。 */
  reused?: boolean;
  /** 分支此前已存在；允许复用，但不能当作本次创建的分支删除。 */
  existingBranch?: boolean;
}

export interface TaskCreationManifest {
  workspaceDirectory: string;
  workspaceDirectoryOwned: boolean;
  /** 新布局共用设置根目录；缺省是旧版本独占的任务/批次目录，用于中断恢复。 */
  workspaceDirectoryShared?: boolean;
  attachmentDirectory: string;
  attachmentDirectoryOwned: boolean;
  steps: WorkspaceStep[];
}

export async function prepareWorkspace(info: TaskResourceInfo, input: TaskResourceInput, prefix: string, workspaceDirectory: string, occupiedPaths: string[] = []): Promise<WorkspaceStep> {
  const resource: TaskResource = { ...input, repositoryId: input.resourceId, name: info.name, originalPath: info.path, workingPath: info.git?.root ?? info.path };
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
  if (input.useExistingBranch) {
    await prepareExistingBranch(step);
    if (step.reused) return step;
    if (!step.existingBranch) await validateNewBranch(step.repository, resource.targetBranch);
  } else {
    resource.targetBranch = input.targetBranch.trim() || await generateTaskBranch(step.repository, prefix);
    await validateNewBranch(step.repository, resource.targetBranch);
  }
  if (input.mode === "new-branch" && await taskGit(step.repository, ["status", "--porcelain"])) throw new Error("TASK_DIRTY_REPOSITORY");
  if (input.mode === "worktree") {
    await assignWorktreePath(step, workspaceDirectory, occupiedPaths);
  }
  return step;
}

export async function createWorkspace(step: WorkspaceStep, persist: () => Promise<void>) {
  const { resource } = step;
  if (step.reused || resource.mode === "folder" || resource.mode === "current-branch") return;
  if (resource.mode === "new-branch") {
    if (await taskGit(step.repository, ["status", "--porcelain"])
      || await taskGit(step.repository, ["rev-parse", "HEAD"]) !== step.previousHead
      || (await gitValue(step.repository, ["symbolic-ref", "--quiet", "HEAD"]) ?? "") !== (step.previousBranch ? "refs/heads/" + step.previousBranch : "")) throw new Error("TASK_RESOURCE_CHANGED");
  }
  if (step.existingBranch && await gitValue(step.repository, ["rev-parse", "--verify", "refs/heads/" + resource.targetBranch + "^{commit}"]) !== step.baseCommit) throw new Error("TASK_RESOURCE_CHANGED");
  for (let attempt = 0; !step.existingBranch && attempt < 10; attempt += 1) {
    try {
      await validateNewBranch(step.repository, resource.targetBranch);
      await taskGit(step.repository, ["branch", resource.targetBranch, step.baseCommit]);
      break;
    } catch (error) {
      const collision = await gitValue(step.repository, ["show-ref", "--verify", "--quiet", "refs/heads/" + resource.targetBranch]) !== null;
      if (resource.useExistingBranch || !step.automaticTarget || !collision || attempt === 9) throw error;
      resource.targetBranch = await generateTaskBranch(step.repository, step.branchPrefix);
      if (resource.mode === "worktree") await assignWorktreePath(step, path.dirname(resource.workingPath));
      await persist();
    }
  }
  step.branchCreated = !step.existingBranch;
  await persist();
  if (resource.mode === "worktree") {
    // Git 允许使用已有空目录；先独占创建，防止把其他任务或用户目录认作自己的。
    await mkdir(resource.workingPath);
    const reserved = await lstat(resource.workingPath, { bigint: true });
    step.directoryReservation = { path: await realpath(resource.workingPath), id: reserved.dev + ":" + reserved.ino };
    await persist();
    const lockReason = "Navo 托管工作区 " + randomUUID();
    // 创建时即加锁，避免 add 和 lock 分两次执行留下未保护的工作区。
    await taskGit(step.repository, ["worktree", "add", "--lock", "--reason", lockReason, resource.workingPath, resource.targetBranch]);
    step.worktreeCreated = true;
    const directory = await stat(resource.workingPath, { bigint: true });
    const commonDirectory = await realpath(await taskGit(resource.workingPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
    const common = await stat(commonDirectory, { bigint: true });
    resource.ownership = {
      path: await realpath(resource.workingPath), directoryId: directory.dev + ":" + directory.ino,
      gitDirectory: await realpath(await taskGit(resource.workingPath, ["rev-parse", "--absolute-git-dir"])),
      commonDirectory, commonDirectoryId: common.dev + ":" + common.ino, branchCreated: step.branchCreated, lockReason,
    };
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
  return diagnosticOperation("worktree.rollback", { resourceCount: manifest.steps.length }, async () => {
    let retained = false;
    for (const step of [...manifest.steps].reverse()) {
      const { resource } = step;
      if (step.reused || resource.mode === "folder" || resource.mode === "current-branch") continue;
      try {
        if (resource.mode === "worktree" && await exists(resource.workingPath)) {
          if (!step.worktreeCreated) {
            const directory = await lstat(resource.workingPath, { bigint: true });
            if (!step.directoryReservation || directory.isSymbolicLink()
              || await realpath(resource.workingPath) !== step.directoryReservation.path
              || directory.dev + ":" + directory.ino !== step.directoryReservation.id) { retained = true; continue; }
            // 仅 rmdir 空目录，Git 的部分结果或用户新增内容保留供检查。
            await rmdir(resource.workingPath);
          } else {
            if ((await lstat(resource.workingPath)).isSymbolicLink()
              || await taskGit(resource.workingPath, ["rev-parse", "HEAD"]) !== step.baseCommit
              || await taskGit(resource.workingPath, ["status", "--porcelain", "--untracked-files=all", "--ignored"])) { retained = true; continue; }
            await removeTaskWorktree(resource);
          }
        }
        if (resource.mode === "new-branch") {
          const current = await gitValue(step.repository, ["symbolic-ref", "--quiet", "HEAD"]);
          if (current === "refs/heads/" + resource.targetBranch) {
            if (!step.checkedOut || await taskGit(step.repository, ["status", "--porcelain"])
              || await taskGit(step.repository, ["rev-parse", "HEAD"]) !== step.baseCommit) { retained = true; continue; }
            await taskGit(step.repository, step.previousBranch ? ["switch", "--no-overwrite-ignore", step.previousBranch] : ["switch", "--no-overwrite-ignore", "--detach", step.previousHead]);
          }
        }
        if (step.existingBranch && !step.branchCreated) continue;
        const ref = "refs/heads/" + resource.targetBranch;
        const head = await taskGit(step.repository, ["for-each-ref", "--format=%(objectname)", ref]);
        if (head) {
          const worktrees = await taskGit(step.repository, ["worktree", "list", "--porcelain"]);
          if (!step.branchCreated || head !== step.baseCommit || worktrees.split("\n").includes("branch " + ref)) { retained = true; continue; }
          await taskGit(step.repository, ["update-ref", "-d", ref, step.baseCommit]);
        }
      } catch (error) {
        retained = true;
        void writeDiagnosticEvent("worktree.rollback.failed", { resourceId: resource.resourceId, error });
      }
    }
    if (!manifest.workspaceDirectoryShared && manifest.workspaceDirectoryOwned) {
      try { await rmdir(manifest.workspaceDirectory); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") retained = true; }
    } else if (!manifest.workspaceDirectoryShared && manifest.steps.some((step) => !step.reused && step.resource.mode === "worktree") && await exists(manifest.workspaceDirectory)) retained = true;
    if (retained) void writeDiagnosticEvent("task.cleanup_retained", { resourceCount: manifest.steps.length });
    else void writeDiagnosticEvent("worktree.rollback.succeeded", { resourceCount: manifest.steps.length });
    return retained;
  }, { started: true, success: false });
}

export async function createWorkspaceDirectory(manifest: TaskCreationManifest, persist: () => Promise<void>) {
  if (!manifest.steps.some((step) => !step.reused && step.resource.mode === "worktree")) return;
  if (manifest.workspaceDirectoryShared) {
    await mkdir(manifest.workspaceDirectory, { recursive: true });
    return;
  }
  await mkdir(path.dirname(manifest.workspaceDirectory), { recursive: true });
  await mkdir(manifest.workspaceDirectory);
  manifest.workspaceDirectoryOwned = true;
  await persist();
}
