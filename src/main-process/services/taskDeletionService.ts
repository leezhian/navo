import { randomUUID } from "node:crypto";
import type { Task } from "../../domain/tasks";
import type { TaskDeletionConfirmation, TaskDeletionOptions, TaskDeletionPreview, TaskDeletionProgress } from "../../shared/taskDeletionTypes";
import { TaskRepository } from "./taskRepository";
import { inspectDeletionItem, ownsWorkspace } from "./taskDeletionInspection";
import { branchOid, deletionFingerprint, deletionGit, pathExists, worktreeList } from "./taskDeletionGit";

const CONFIRMATION_LIFETIME_MS = 5 * 60 * 1000;
const KEEP_RESOURCES: TaskDeletionOptions = { deleteWorktrees: false, deleteBranches: false };

export class TaskDeletionService {
  private readonly confirmations = new Map<number, { taskId: string; token: string; expiresAt: number; options: TaskDeletionOptions; signature: string }>();

  constructor(private readonly repository: TaskRepository) {}

  forgetOwner(ownerId: number) { this.confirmations.delete(ownerId); }

  private async inspect(taskId: string, options: TaskDeletionOptions) {
    const task = (await this.repository.load())?.find((item) => item.id === taskId);
    if (!task) throw new Error("TASK_NOT_FOUND");
    const context = await this.repository.deletionContext(taskId);
    const entries = [];
    for (const resource of task.resources ?? []) entries.push(await inspectDeletionItem(task, resource, options, context, this.repository.namespace));
    return {
      task, entries,
      canDeleteWorktrees: (task.resources ?? []).some((resource) => ownsWorkspace(resource, context)),
      blocked: entries.some(({ item }) => item.worktreeReason === "inspectionFailed"),
      signature: deletionFingerprint({ task, options, entries: entries.map((entry) => entry.fingerprint) }),
    };
  }

  async preview(taskId: string, options: TaskDeletionOptions, ownerId: number): Promise<TaskDeletionPreview> {
    if (!options || typeof options.deleteWorktrees !== "boolean" || typeof options.deleteBranches !== "boolean" || (options.deleteBranches && !options.deleteWorktrees)) throw new Error("TASK_INVALID");
    const checkedOptions = { deleteWorktrees: options.deleteWorktrees, deleteBranches: options.deleteBranches };
    this.confirmations.delete(ownerId);
    const inspection = await this.inspect(taskId, checkedOptions);
    const token = randomUUID();
    this.confirmations.set(ownerId, { taskId, token, options: checkedOptions, signature: inspection.signature, expiresAt: Date.now() + CONFIRMATION_LIFETIME_MS });
    return { token, canDeleteWorktrees: inspection.canDeleteWorktrees, blocked: inspection.blocked, items: inspection.entries.map((entry) => entry.item) };
  }

  /** 所有路径来自已保存任务；客户端只能提交本窗口签发的确认凭据。 */
  async remove(taskId: string, confirmation: TaskDeletionConfirmation | undefined, ownerId: number, removeAttachments: () => Promise<void>): Promise<Task[]> {
    let options = KEEP_RESOURCES;
    let expectedSignature: string | undefined;
    if (confirmation !== undefined) {
      const issued = this.confirmations.get(ownerId);
      this.confirmations.delete(ownerId);
      if (!issued || !confirmation || confirmation.token !== issued.token || taskId !== issued.taskId || Date.now() > issued.expiresAt) throw new Error("TASK_DELETE_CONFIRMATION");
      options = issued.options;
      expectedSignature = issued.signature;
    }
    const inspection = await this.inspect(taskId, options);
    if (expectedSignature && inspection.signature !== expectedSignature) throw new Error("TASK_DELETE_CHANGED");
    if (inspection.blocked) throw new Error("TASK_DELETE_INSPECTION");
    try {
      for (const entry of inspection.entries) {
        if (entry.item.worktreeAction !== "delete" && entry.item.branchAction !== "delete") continue;
        const current = await this.inspect(taskId, options);
        const latest = current.entries.find((item) => item.item.resourceId === entry.item.resourceId);
        if (!latest || latest.fingerprint !== entry.fingerprint) throw new Error("TASK_DELETE_CHANGED");
        const progress: TaskDeletionProgress = { resourceId: entry.resource.resourceId, worktree: "pending", branchOid: entry.branchOid };
        if (entry.item.worktreeAction === "delete") {
          await this.repository.recordDeletion(taskId, progress);
          // 日志写入期间文件仍可能变化；再次检查后才执行一次 --force，不绕过锁定 Worktree。
          const checked = await this.inspect(taskId, options);
          if (checked.entries.find((item) => item.item.resourceId === entry.item.resourceId)?.fingerprint !== entry.fingerprint) throw new Error("TASK_DELETE_CHANGED");
          const force = entry.item.uncommittedFiles > 0 || entry.item.ignoredFiles > 0;
          await deletionGit(entry.resource.originalPath, ["worktree", "remove", ...(force ? ["--force"] : []), "--", entry.resource.workingPath]);
        }
        progress.worktree = "removed";
        await this.repository.recordDeletion(taskId, progress);
        if (entry.item.branchAction === "delete") {
          const remaining = await this.inspect(taskId, options);
          const candidate = remaining.entries.find((item) => item.item.resourceId === entry.item.resourceId);
          if (!candidate || candidate.item.branchAction !== "delete" || candidate.branchFingerprint !== entry.branchFingerprint
            || await pathExists(entry.resource.workingPath)) throw new Error("TASK_DELETE_CHANGED");
          progress.branch = "pending";
          await this.repository.recordDeletion(taskId, progress);
          const rechecked = await this.inspect(taskId, options);
          if (rechecked.entries.find((item) => item.item.resourceId === entry.item.resourceId)?.branchFingerprint !== entry.branchFingerprint) throw new Error("TASK_DELETE_CHANGED");
          const worktrees = await worktreeList(entry.resource.originalPath);
          if (worktrees.some((worktree) => worktree.branch === "refs/heads/" + entry.resource.targetBranch)
            || await branchOid(entry.resource.originalPath, entry.resource.targetBranch) !== entry.branchOid) throw new Error("TASK_DELETE_CHANGED");
          // CAS 防止预检查之后分支 tip 被外部 Git 改写；绝不执行远端删除。
          await deletionGit(entry.resource.originalPath, ["update-ref", "--no-deref", "-d", "refs/heads/" + entry.resource.targetBranch, entry.branchOid]);
          progress.branch = "removed";
          await this.repository.recordDeletion(taskId, progress);
        }
      }
      await removeAttachments();
      return await this.repository.completeDeletion(taskId);
    } catch (error) {
      if (error instanceof Error && error.message === "TASK_DELETE_CHANGED") throw error;
      throw new Error("TASK_DELETE_FAILED");
    }
  }
}
