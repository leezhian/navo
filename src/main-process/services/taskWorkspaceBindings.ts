import path from "node:path";
import type { AppSettings } from "../../domain/types";
import type { AddTaskResourcesInput } from "../../shared/taskResourceTypes";
import type { TaskResourceInfo } from "../../shared/taskTypes";
import { isTaskResourceInput } from "../../utils/taskResourceInput";
import { diagnosticOperation, writeDiagnosticEvent } from "../diagnostics/diagnosticLogger";
import { TaskRepository } from "./taskRepository";
import { TaskResourceRepository } from "./taskResourceRepository";
import { assignWorkspaceIdentities } from "./taskWorkspaceIdentity";
import { resolveResourcePath } from "./resourcePaths";
import { createWorkspace, createWorkspaceDirectory, prepareWorkspace, rollbackWorkspaces } from "./taskWorkspaces";
import type { TaskCreationManifest } from "./taskWorkspaces";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export class TaskWorkspaceBindings {
  private readonly resources: TaskResourceRepository;
  constructor(private readonly tasks: TaskRepository, filename: string, namespace: string,
    private readonly getSettings: () => AppSettings, private readonly inspect: (id: string) => Promise<TaskResourceInfo>) {
    this.resources = new TaskResourceRepository(filename, namespace);
  }

  async add(taskId: string, input: AddTaskResourcesInput) {
    if (typeof taskId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(taskId)
      || !input || typeof input.requestId !== "string" || !UUID.test(input.requestId)
      || !Array.isArray(input.resources) || !input.resources.length || input.resources.length > 100 || !input.resources.every(isTaskResourceInput)
      || [input.links, input.webLinks, input.notes, input.fileIds].some((items) => !Array.isArray(items) || items.length)) throw new Error("TASK_INVALID");
    const tasks = await this.tasks.load() ?? [];
    const task = tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("TASK_NOT_FOUND");
    if (await this.resources.hasBatch(taskId, input.requestId)) return task;
    if (task.status === "ARCHIVED" || (await this.tasks.deletionContext(taskId)).progress.length) throw new Error("TASK_BUSY");
    if (tasks.some((item) => item.id === input.requestId)) throw new Error("TASK_INVALID");
    if ((await this.tasks.operations()).some((operation) => operation.id === input.requestId)) throw new Error("TASK_CREATE_RETAINED");
    const existing = task.resources ?? [];
    const infos = await Promise.all(input.resources.map((resource) => this.inspect(resource.resourceId)));
    const settings = this.getSettings();
    const manifest: TaskCreationManifest = {
      workspaceDirectory: path.join(resolveResourcePath(settings.worktreesDirectory), taskId, input.requestId),
      workspaceDirectoryOwned: false, attachmentDirectory: "", attachmentDirectoryOwned: false, steps: [],
    };
    for (let index = 0; index < infos.length; index += 1) {
      manifest.steps.push(await prepareWorkspace(infos[index], input.resources[index], settings.branchPrefix, manifest.workspaceDirectory, existing.length + index + 1));
    }
    manifest.steps = await assignWorkspaceIdentities(manifest.steps, existing);
    const persist = () => this.tasks.recordOperation(input.requestId, "pending", manifest);
    await persist();
    try {
      await createWorkspaceDirectory(manifest, persist);
      for (const step of manifest.steps) {
        if (step.resource.mode === "worktree" || step.resource.mode === "new-branch") {
          await diagnosticOperation(step.resource.mode === "worktree" ? "worktree.create" : "branch.create",
            { taskId, resourceId: step.resource.resourceId }, () => createWorkspace(step, persist), { started: true });
        } else await createWorkspace(step, persist);
      }
      await this.resources.appendWorkspaces(taskId, input.requestId, manifest.steps.map((step) => step.resource));
    } catch (error) {
      if (await rollbackWorkspaces(manifest)) {
        await this.tasks.recordOperation(input.requestId, "retained", manifest);
        void writeDiagnosticEvent("task.cleanup_retained", { taskId, resourceCount: manifest.steps.length });
        throw new Error("TASK_CREATE_RETAINED");
      }
      await this.tasks.clearOperation(input.requestId);
      throw error;
    }
    // 读取事务保存后的完整任务，包含更新时间，保证首次响应与幂等重试一致。
    const updated = (await this.tasks.load())?.find((item) => item.id === taskId);
    if (!updated) throw new Error("TASK_NOT_FOUND");
    return updated;
  }
}
