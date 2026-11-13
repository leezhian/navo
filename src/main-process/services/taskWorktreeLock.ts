import { realpath } from "node:fs/promises";
import type { TaskResource } from "../../shared/taskTypes";
import { deletionGit, directoryIdentity, worktreeList } from "./taskDeletionGit";

export function isTaskWorktreeLock(resource: TaskResource, checkout: { locked: boolean; lockReason: string }) {
  return checkout.locked && Boolean(resource.ownership?.lockReason)
    && checkout.lockReason === resource.ownership?.lockReason;
}

async function matchesOwnership(resource: TaskResource) {
  const ownership = resource.ownership;
  if (!ownership) return false;
  const directory = await directoryIdentity(resource.workingPath);
  const gitDirectory = await realpath((await deletionGit(resource.workingPath, ["rev-parse", "--absolute-git-dir"])).trim());
  const common = await directoryIdentity((await deletionGit(resource.workingPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim());
  return directory.path === ownership.path && directory.id === ownership.directoryId
    && gitDirectory === ownership.gitDirectory && common.path === ownership.commonDirectory && common.id === ownership.commonDirectoryId;
}

/** 仅在安全回滚或用户确认清理后调用；外部锁始终保留，不用双重 --force 绕过锁。 */
export async function removeTaskWorktree(resource: TaskResource, force = false) {
  const findCheckout = async () => (await worktreeList(resource.originalPath))
    .find((checkout) => checkout.path === resource.ownership?.path || checkout.path === resource.workingPath);
  const checkout = await findCheckout();
  if (!checkout) throw new Error("TASK_DELETE_CHANGED");
  const ownedLock = isTaskWorktreeLock(resource, checkout);
  if (checkout.locked && (!ownedLock || !await matchesOwnership(resource))) throw new Error("TASK_DELETE_CHANGED");
  if (ownedLock) await deletionGit(resource.originalPath, ["worktree", "unlock", "--", resource.workingPath]);
  try {
    await deletionGit(resource.originalPath, ["worktree", "remove", ...(force ? ["--force"] : []), "--", resource.workingPath]);
  } catch (error) {
    // 删除失败时恢复自己的锁；期间若出现外部锁或目录被替换，不覆盖它。
    if (ownedLock) {
      const remaining = await findCheckout();
      if (remaining && !remaining.locked && await matchesOwnership(resource)) {
        await deletionGit(resource.originalPath, ["worktree", "lock", "--reason", checkout.lockReason, "--", resource.workingPath]);
      }
    }
    throw error;
  }
}
