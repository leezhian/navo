import { randomUUID } from "node:crypto";
import type { TaskDeletionConfirmation, TaskWorktreeDeletionPreview } from "../../shared/taskDeletionTypes";
import type { TaskRepository } from "./taskRepository";
import type { TaskContentRepository } from "./taskContentRepository";
import { inspectDeletionItem } from "./taskDeletionInspection";
import { deletionFingerprint } from "./taskDeletionGit";
import { removeTaskWorktree } from "./taskWorktreeLock";
import { diagnosticOperation } from "../diagnostics/diagnosticLogger";

const CONFIRMATION_LIFETIME_MS = 5 * 60 * 1000;

/** 单独删除 Worktree，复用任务删除的归属和风险检查，始终保留分支。调用者持有任务与会话队列。 */
export class TaskWorktreeDeletionService {
  private readonly confirmations = new Map<number, { taskId: string; resourceId: string; token: string; signature: string; expiresAt: number }>();
  constructor(private readonly repository: TaskRepository, private readonly content: TaskContentRepository) {}
  forgetOwner(ownerId: number) { this.confirmations.delete(ownerId); }

  private async inspect(taskId: string, resourceId: string) {
    if (typeof taskId !== "string" || typeof resourceId !== "string") throw new Error("TASK_INVALID");
    const task = (await this.repository.load())?.find((item) => item.id === taskId);
    if (!task) throw new Error("TASK_NOT_FOUND");
    if (task.status === "ARCHIVED") throw new Error("TASK_BUSY");
    const resource = task.resources?.find((item) => item.resourceId === resourceId);
    if (!resource) throw new Error("TASK_RESOURCE_CHANGED");
    const context = await this.repository.deletionContext(taskId);
    if (context.progress.some((item) => item.resourceId !== resourceId || item.scope !== "workspace")) throw new Error("TASK_BUSY");
    const entry = await inspectDeletionItem(task, resource, { deleteWorktrees: true, deleteBranches: false }, context, this.repository.namespace);
    return { entry, signature: deletionFingerprint({ task, fingerprint: entry.fingerprint }) };
  }

  async preview(taskId: string, resourceId: string, ownerId: number): Promise<TaskWorktreeDeletionPreview> {
    this.confirmations.delete(ownerId);
    const { entry, signature } = await this.inspect(taskId, resourceId);
    const token = randomUUID();
    this.confirmations.set(ownerId, { taskId, resourceId, token, signature, expiresAt: Date.now() + CONFIRMATION_LIFETIME_MS });
    return { token, item: entry.item, blocked: entry.item.worktreeAction === "keep" };
  }

  async remove(taskId: string, resourceId: string, confirmation: TaskDeletionConfirmation, ownerId: number) {
    const issued = this.confirmations.get(ownerId);
    this.confirmations.delete(ownerId);
    if (!issued || !confirmation || issued.token !== confirmation.token || issued.taskId !== taskId
      || issued.resourceId !== resourceId || issued.expiresAt < Date.now()) throw new Error("TASK_DELETE_CONFIRMATION");
    const inspection = await this.inspect(taskId, resourceId);
    if (inspection.signature !== issued.signature) throw new Error("TASK_DELETE_CHANGED");
    const { entry } = inspection;
    if (entry.item.worktreeAction === "keep") throw new Error("TASK_DELETE_INSPECTION");
    const progress = { scope: "workspace" as const, resourceId, worktree: "pending" as const, branchOid: entry.branchOid };
    if (entry.item.worktreeAction === "delete") {
      await this.repository.recordDeletion(taskId, progress);
      if ((await this.inspect(taskId, resourceId)).signature !== issued.signature) throw new Error("TASK_DELETE_CHANGED");
      await diagnosticOperation("worktree.delete", { taskId, resourceId }, () =>
        removeTaskWorktree(entry.resource, entry.item.uncommittedFiles > 0 || entry.item.ignoredFiles > 0), { started: true });
    }
    // 崩溃或落库失败后，重新确认可只完成解除关联，不重复删除目录。
    await this.repository.recordDeletion(taskId, { ...progress, worktree: "removed" });
    await this.content.detach(taskId, { kind: "workspace", id: resourceId }, resourceId);
    const task = (await this.repository.load())?.find((item) => item.id === taskId);
    if (!task) throw new Error("TASK_NOT_FOUND");
    return task;
  }
}
