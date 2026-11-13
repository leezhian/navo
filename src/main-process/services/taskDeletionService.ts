import { randomUUID } from "node:crypto";
import type { Task } from "../../domain/tasks";
import type { TaskCleanupAction, TaskDeletionConfirmation, TaskDeletionOptions, TaskDeletionPreview, TaskDeletionProgress } from "../../shared/taskDeletionTypes";
import { TaskRepository } from "./taskRepository";
import { inspectDeletionItem, ownsWorkspace } from "./taskDeletionInspection";
import { branchOid, deletionFingerprint, deletionGit, pathExists, worktreeList } from "./taskDeletionGit";
import { diagnosticOperation, writeDiagnosticEvent } from "../diagnostics/diagnosticLogger";
import { removeTaskWorktree } from "./taskWorktreeLock";

const CONFIRMATION_LIFETIME_MS = 5 * 60 * 1000;
const KEEP_RESOURCES: TaskDeletionOptions = { deleteWorktrees: false, deleteBranches: false };

export class TaskDeletionService {
  private readonly confirmations = new Map<number, { taskId: string; action: TaskCleanupAction; token: string; expiresAt: number; options: TaskDeletionOptions; signature: string }>();

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
      // 归档／删除会主动停止初始化；仅状态变化不作废确认，脚本造成的文件变化仍由各工作区指纹核对。
      signature: deletionFingerprint({ task: { ...task, initialization: undefined }, options, entries: entries.map((entry) => entry.fingerprint) }),
    };
  }

  async preview(taskId: string, options: TaskDeletionOptions, ownerId: number, action: TaskCleanupAction = "delete"): Promise<TaskDeletionPreview> {
    if (action !== "delete" && action !== "archive") throw new Error("TASK_INVALID");
    if (!options || typeof options.deleteWorktrees !== "boolean" || typeof options.deleteBranches !== "boolean" || (options.deleteBranches && !options.deleteWorktrees)) throw new Error("TASK_INVALID");
    const checkedOptions = { deleteWorktrees: options.deleteWorktrees, deleteBranches: options.deleteBranches };
    this.confirmations.delete(ownerId);
    const inspection = await this.inspect(taskId, checkedOptions);
    const token = randomUUID();
    this.confirmations.set(ownerId, { taskId, action, token, options: checkedOptions, signature: inspection.signature, expiresAt: Date.now() + CONFIRMATION_LIFETIME_MS });
    return { token, canDeleteWorktrees: inspection.canDeleteWorktrees, blocked: inspection.blocked, items: inspection.entries.map((entry) => entry.item) };
  }

  /** 所有路径来自已保存任务；客户端只能提交本窗口签发的确认凭据。 */
  async remove(taskId: string, confirmation: TaskDeletionConfirmation | undefined, ownerId: number, removeAttachments: () => Promise<void>): Promise<Task[]> {
    return this.cleanup(taskId, confirmation, ownerId, "delete", async () => {
      await removeAttachments();
      return this.repository.completeDeletion(taskId);
    });
  }

  archive(taskId: string, confirmation: TaskDeletionConfirmation | undefined, ownerId: number, beforeTaskId: string | null = null) {
    return this.cleanup(taskId, confirmation, ownerId, "archive", () => this.repository.completeArchival(taskId, beforeTaskId));
  }

  /** 停止进程前只读核对确认范围；归档与删除的凭据不可互用。执行时仍会再次核对并消费。 */
  confirmationOptions(taskId: string, confirmation: TaskDeletionConfirmation | undefined, ownerId: number, action: TaskCleanupAction): TaskDeletionOptions {
    if (confirmation === undefined) return { ...KEEP_RESOURCES };
    const issued = this.confirmations.get(ownerId);
    if (!issued || !confirmation || confirmation.token !== issued.token || taskId !== issued.taskId || issued.action !== action || Date.now() > issued.expiresAt) throw new Error(action === "archive" ? "TASK_ARCHIVE_CONFIRMATION" : "TASK_DELETE_CONFIRMATION");
    return { ...issued.options };
  }

  private async cleanup(taskId: string, confirmation: TaskDeletionConfirmation | undefined, ownerId: number, action: TaskCleanupAction, complete: () => Promise<Task[]>): Promise<Task[]> {
    const options = this.confirmationOptions(taskId, confirmation, ownerId, action);
    let expectedSignature: string | undefined;
    if (confirmation !== undefined) {
      expectedSignature = this.confirmations.get(ownerId)?.signature;
      this.confirmations.delete(ownerId);
    }
    const inspection = await this.inspect(taskId, options);
    if (expectedSignature && inspection.signature !== expectedSignature) throw new Error(action === "archive" ? "TASK_ARCHIVE_CHANGED" : "TASK_DELETE_CHANGED");
    if (inspection.blocked) throw new Error(action === "archive" ? "TASK_ARCHIVE_INSPECTION" : "TASK_DELETE_INSPECTION");
    try {
      for (const entry of inspection.entries) {
        if (options.deleteWorktrees && entry.item.worktreeAction === "keep") {
          void writeDiagnosticEvent("worktree.kept", { resourceId: entry.item.resourceId, reason: entry.item.worktreeReason });
        }
        if (options.deleteBranches && entry.item.branchAction === "keep" && entry.item.branchReason) {
          void writeDiagnosticEvent("branch.kept", { resourceId: entry.item.resourceId, reason: entry.item.branchReason });
        }
        if (entry.item.worktreeAction !== "delete" && entry.item.branchAction !== "delete") continue;
        const current = await this.inspect(taskId, options);
        const latest = current.entries.find((item) => item.item.resourceId === entry.item.resourceId);
        if (!latest || latest.fingerprint !== entry.fingerprint) throw new Error("TASK_DELETE_CHANGED");
        const progress: TaskDeletionProgress = { ...(action === "archive" ? { scope: "archive" as const } : {}), resourceId: entry.resource.resourceId, worktree: "pending", branchOid: entry.branchOid };
        if (entry.item.worktreeAction === "delete") {
          await this.repository.recordDeletion(taskId, progress);
          // 日志写入期间文件仍可能变化；再次检查后仅解开匹配的应用锁，不绕过外部锁。
          const checked = await this.inspect(taskId, options);
          if (checked.entries.find((item) => item.item.resourceId === entry.item.resourceId)?.fingerprint !== entry.fingerprint) throw new Error("TASK_DELETE_CHANGED");
          const force = entry.item.uncommittedFiles > 0 || entry.item.ignoredFiles > 0;
          await diagnosticOperation("worktree.delete", {
            resourceId: entry.item.resourceId, uncommittedFiles: entry.item.uncommittedFiles, ignoredFiles: entry.item.ignoredFiles,
          }, () => removeTaskWorktree(entry.resource, force), { started: true });
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
          await diagnosticOperation("branch.delete", { resourceId: entry.item.resourceId },
            () => deletionGit(entry.resource.originalPath, ["update-ref", "--no-deref", "-d", "refs/heads/" + entry.resource.targetBranch, entry.branchOid]), { started: true });
          progress.branch = "removed";
          await this.repository.recordDeletion(taskId, progress);
        }
      }
      return await complete();
    } catch (error) {
      void writeDiagnosticEvent("task.cleanup_retained", { taskId, error });
      if (error instanceof Error && error.message === "TASK_DELETE_CHANGED") throw action === "archive" ? new Error("TASK_ARCHIVE_CHANGED") : error;
      throw new Error(action === "archive" ? "TASK_ARCHIVE_FAILED" : "TASK_DELETE_FAILED");
    }
  }
}
