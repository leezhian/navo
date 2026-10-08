import { realpath } from "node:fs/promises";
import path from "node:path";
import type { Task } from "../../domain/tasks";
import type { TaskResource } from "../../shared/taskTypes";
import type { TaskDeletionItem, TaskDeletionOptions } from "../../shared/taskDeletionTypes";
import type { TaskRepository } from "./taskRepository";
import { branchOid, deletionFingerprint, deletionGit, directoryIdentity, pathExists, workingCopyRisk, worktreeList } from "./taskDeletionGit";
import { writeDiagnosticEvent } from "../diagnostics/diagnosticLogger";

type DeletionContext = Awaited<ReturnType<TaskRepository["deletionContext"]>>;
export interface InspectedDeletionItem {
  item: TaskDeletionItem;
  resource: TaskResource;
  fingerprint: string;
  branchOid: string;
  branchFingerprint: string;
}

export function ownsWorkspace(resource: TaskResource, context: DeletionContext) {
  return resource.mode === "worktree" && Boolean(resource.ownership)
    && context.owned.some((owned) => owned.path === resource.workingPath && owned.branch === resource.targetBranch && owned.repository === resource.originalPath);
}

export async function inspectDeletionItem(task: Task, resource: TaskResource, options: TaskDeletionOptions, context: DeletionContext, namespace: string): Promise<InspectedDeletionItem> {
  const item: TaskDeletionItem = {
    resourceId: resource.resourceId, name: resource.name, path: resource.workingPath, branch: resource.targetBranch,
    worktreeAction: "keep", branchAction: "keep", sharedTasks: [], uncommittedFiles: 0, ignoredFiles: 0,
    detached: false, unpushedCommits: null,
  };
  let oid = "";
  let evidence: unknown = null;
  let remoteRefs = "";
  const result = () => ({
    item, resource, branchOid: oid,
    fingerprint: deletionFingerprint({ item, resource, oid, evidence }),
    branchFingerprint: deletionFingerprint({ oid, remoteRefs, action: item.branchAction, reason: item.branchReason, unpushed: item.unpushedCommits }),
  });
  if (resource.mode !== "worktree") { item.worktreeReason = "existing"; return result(); }
  if (!ownsWorkspace(resource, context)) { item.worktreeReason = "unowned"; return result(); }
  const progress = context.progress.find((entry) => entry.resourceId === resource.resourceId);
  if (!options.deleteWorktrees) {
    item.worktreeAction = progress?.worktree === "removed" ? "removed" : "keep";
    item.branchAction = progress?.branch === "removed" ? "removed" : "keep";
    if (progress) {
      try {
        if (!await pathExists(resource.workingPath) && !(await worktreeList(resource.originalPath)).some((worktree) => worktree.path === resource.ownership?.path || worktree.path === resource.workingPath)) {
          item.worktreeAction = "removed";
          if (progress.branch && !await branchOid(resource.originalPath, resource.targetBranch)) item.branchAction = "removed";
        }
      } catch { /* 仅删除任务不依赖 Git 可用性，不自动恢复清理。 */ }
    }
    return result();
  }
  try {
    const ownership = resource.ownership;
    if (!ownership) { item.worktreeReason = "unowned"; return result(); }
    const commonPath = (await deletionGit(resource.originalPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim();
    const common = await directoryIdentity(commonPath);
    if (common.path !== ownership.commonDirectory || common.id !== ownership.commonDirectoryId) {
      item.worktreeReason = "changed"; return result();
    }
    const otherReferences = context.references.filter((reference) => reference.namespace !== namespace || reference.taskId !== task.id || reference.resource.resourceId !== resource.resourceId);
    const referencePaths = await Promise.all(otherReferences.map(async (reference) => ({
      ...reference, workingPath: await realpath(reference.resource.workingPath).catch(() => path.resolve(reference.resource.workingPath)),
    })));
    item.sharedTasks = [...new Set(referencePaths.filter((reference) => reference.workingPath === ownership.path || reference.workingPath.startsWith(ownership.path + path.sep)).map((reference) => reference.title))];
    if (item.sharedTasks.length) { item.worktreeReason = "shared"; return result(); }
    const worktrees = await worktreeList(resource.originalPath);
    const exists = await pathExists(resource.workingPath);
    oid = await branchOid(resource.originalPath, resource.targetBranch);
    // 同仓库的其他工作区可能刚由本批次清理，仅将当前目录及占用同一分支的工作区纳入确认指纹。
    const relevantWorktrees = worktrees.filter((worktree) => worktree.path === ownership.path || worktree.path === resource.workingPath || worktree.branch === "refs/heads/" + resource.targetBranch);
    evidence = { common, worktrees: relevantWorktrees, oid };
    if (exists) {
      if (progress?.worktree === "removed" || progress?.branch) { item.worktreeReason = "changed"; return result(); }
      const directory = await directoryIdentity(resource.workingPath);
      const gitDirectory = await realpath((await deletionGit(resource.workingPath, ["rev-parse", "--absolute-git-dir"])).trim());
      const currentCommon = await realpath((await deletionGit(resource.workingPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim());
      if (gitDirectory === currentCommon) { item.worktreeReason = "main"; return result(); }
      if (directory.path !== ownership.path || directory.id !== ownership.directoryId || gitDirectory !== ownership.gitDirectory || currentCommon !== common.path) {
        item.worktreeReason = "changed"; return result();
      }
      const checkout = worktrees.find((worktree) => worktree.path === ownership.path || worktree.path === resource.workingPath);
      if (!checkout || (checkout.branch && checkout.branch !== "refs/heads/" + resource.targetBranch)) { item.worktreeReason = "changed"; return result(); }
      if (checkout.locked) { item.worktreeReason = "locked"; return result(); }
      const risk = await workingCopyRisk(resource.workingPath);
      item.uncommittedFiles = risk.uncommittedFiles;
      item.ignoredFiles = risk.ignoredFiles;
      item.detached = !checkout.branch;
      evidence = { evidence, risk };
      item.worktreeAction = "delete";
    } else if (progress && !worktrees.some((worktree) => worktree.path === ownership.path || worktree.path === resource.workingPath)) {
      item.worktreeAction = "removed";
      if (progress.branch === "removed") {
        item.branchAction = "removed";
        if (oid) { item.branchAction = "keep"; item.branchReason = "changed"; }
        return result();
      }
      if (progress.branch === "pending" && !oid) { item.branchAction = "removed"; return result(); }
      if (oid !== progress.branchOid) { item.branchReason = "changed"; return result(); }
    } else { item.worktreeReason = "missing"; return result(); }
    if (!options.deleteBranches) return result();
    if (ownership.branchCreated === false) { item.branchReason = "existing"; return result(); }
    if (!oid) { item.branchReason = "missing"; return result(); }
    remoteRefs = await deletionGit(resource.originalPath, ["for-each-ref", "--format=%(refname) %(objectname) %(symref)", "refs/remotes"]);
    const defaultBranches = remoteRefs.split("\n").filter((line) => /refs\/remotes\/[^ ]+\/HEAD /.test(line)).map((line) => line.trim().split(" ").slice(-1)[0]?.replace(/^refs\/remotes\/[^/]+\//, ""));
    if (["main", "master", "develop", "development", "trunk", ...defaultBranches].includes(resource.targetBranch)) { item.branchReason = "protected"; return result(); }
    const otherWorktree = worktrees.some((worktree) => worktree.branch === "refs/heads/" + resource.targetBranch && worktree.path !== ownership.path && worktree.path !== resource.workingPath);
    let sharedBranch = false;
    for (const reference of referencePaths.filter((reference) => reference.resource.mode !== "folder" && reference.resource.targetBranch === resource.targetBranch)) {
      const referenceCommon = await realpath((await deletionGit(reference.resource.originalPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim());
      if (referenceCommon === common.path) sharedBranch = true;
    }
    if (otherWorktree || sharedBranch) { item.branchReason = "inUse"; return result(); }
    item.branchAction = "delete";
    if (remoteRefs.trim()) {
      const count = (await deletionGit(resource.originalPath, ["rev-list", "--count", "refs/heads/" + resource.targetBranch, "--not", "--remotes"])).trim();
      if (!/^\d+$/.test(count)) throw new Error("TASK_DELETE_INSPECTION");
      item.unpushedCommits = Number(count);
    }
    evidence = { evidence, remoteRefs };
  } catch (error) {
    void writeDiagnosticEvent("worktree.inspect.failed", { taskId: task.id, resourceId: resource.resourceId, error });
    item.worktreeAction = "keep";
    item.branchAction = "keep";
    item.worktreeReason = "inspectionFailed";
  }
  return result();
}
