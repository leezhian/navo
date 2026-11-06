import { diagnosticOperation, writeDiagnosticEvent } from "../diagnostics/diagnosticLogger";
import path from "node:path";
import type { AppSettings } from "../../domain/types";
import type { Task, TaskStatus } from "../../domain/tasks";
import type { CreateTaskInput, TaskBootstrap } from "../../shared/taskTypes";
import { isTaskWebLink } from "../../utils/taskWebLinks";
import { isIssueItem, isTask } from "../../utils/adeDataValidation";
import { moveTask } from "../../utils/taskState";
import { ResourceService } from "./resourceService";
import { resolveResourcePath } from "./resourcePaths";
import { TaskRepository } from "./taskRepository";
import { inspectTaskResource } from "./taskGit";
import { TaskAttachmentSelections, attachmentPreview, createAttachmentDirectory, removeAttachmentDirectory } from "./taskAttachments";
import { createWorkspace, createWorkspaceDirectory, prepareWorkspace, rollbackWorkspaces } from "./taskWorkspaces";
import type { TaskCreationManifest } from "./taskWorkspaces";
import type { TaskDeletionConfirmation, TaskDeletionOptions } from "../../shared/taskDeletionTypes";
import { TaskDeletionService } from "./taskDeletionService";
import { isLegacyDemoTask } from "../../shared/legacyDemoRecords";
import type { TaskAgentSelection } from "../../shared/agentCapabilities";
import { isTaskAgentSelection } from "../../utils/taskAgentSelection";
import type { AddTaskResourcesInput, TaskNoteInput, TaskNoteUpdate } from "../../shared/taskResourceTypes";
import { TaskResourceBindings } from "./taskResourceBindings";
import { TaskWorkspaceBindings } from "./taskWorkspaceBindings";
import { isTaskResourceInput } from "../../utils/taskResourceInput";
import { assignWorkspaceIdentities } from "./taskWorkspaceIdentity";
import { TaskContentRepository } from "./taskContentRepository";
import { TaskWorktreeDeletionService } from "./taskWorktreeDeletionService";
import type { TaskResourceRemoval } from "../../shared/taskContextTypes";
import { planWorktreeInitialization, TaskInitializationRepository } from "./taskInitializationRepository";

const REQUEST_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TASK_STATUSES: TaskStatus[] = ["TODO", "DONE", "ARCHIVED"];

export class TaskService {
  readonly repository: TaskRepository;
  readonly files = new TaskAttachmentSelections();
  private readonly resources: ResourceService;
  private queue: Promise<unknown> = Promise.resolve();
  private recovered = false;
  readonly deletion: TaskDeletionService;
  readonly worktreeDeletion: TaskWorktreeDeletionService;
  readonly resourceBindings: TaskResourceBindings;
  private readonly workspaceBindings: TaskWorkspaceBindings;
  private readonly content: TaskContentRepository;
  private readonly initializationReady: Promise<void>;

  constructor(private readonly userData: string, private readonly namespace: "development" | "production", private readonly getSettings: () => AppSettings,
    private readonly resolveAgent?: (selection: TaskAgentSelection) => Promise<TaskAgentSelection>) {
    this.repository = new TaskRepository(path.join(userData, "app.db"), namespace);
    this.initializationReady = new TaskInitializationRepository(path.join(userData, "app.db"), namespace).recover();
    // 保留失败供队列调用者处理，同时避免启动阶段未订阅的 rejected promise。
    void this.initializationReady.catch(() => undefined);
    this.content = new TaskContentRepository(path.join(userData, "app.db"), namespace);
    this.worktreeDeletion = new TaskWorktreeDeletionService(this.repository, this.content);
    this.resources = new ResourceService(path.join(userData, "resources.json"));
    this.deletion = new TaskDeletionService(this.repository);
    this.resourceBindings = new TaskResourceBindings(this.repository, path.join(userData, "app.db"), namespace);
    this.workspaceBindings = new TaskWorkspaceBindings(this.repository, path.join(userData, "app.db"), namespace, getSettings, (id) => this.inspectResource(id), () => this.resources.list());
  }

  private serialize<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.queue.then(async () => { await this.initializationReady; return operation(); });
    this.queue = result.catch(() => undefined);
    return result;
  }

  async flush() { await this.queue; }
  addResources(id: string, input: AddTaskResourcesInput, ownerId: number) {
    return diagnosticOperation("task.resources.add", { taskId: id }, () => this.serialize(() => input?.resources !== undefined
      ? this.workspaceBindings.add(id, input) : this.resourceBindings.add(id, input, ownerId)));
  }
  createAgentNote(id: string, note: TaskNoteInput, sessionId: string, authorize: () => void) {
    return diagnosticOperation("task.note.create", { taskId: id, operationId: sessionId }, () => this.serialize(() => this.resourceBindings.createAgentNote(id, note, sessionId, authorize)));
  }
  updateNote(id: string, note: TaskNoteUpdate, expectedVersion: number, authorize?: () => void) {
    return diagnosticOperation("task.note.update", { taskId: id }, () => this.serialize(() => this.resourceBindings.updateNote(id, note, expectedVersion, authorize)));
  }
  updatePrompt(id: string, content: string, expected: string) {
    return this.serialize(async () => { await this.content.updatePrompt(id, content, expected); return requireTask(await this.repository.load() ?? [], id); });
  }
  detachResource(id: string, input: TaskResourceRemoval) {
    return this.serialize(async () => { await this.content.detach(id, input); return requireTask(await this.repository.load() ?? [], id); });
  }
  inspectWorktreeDeletion(id: string, resourceId: string, ownerId: number) {
    return this.serialize(() => this.worktreeDeletion.preview(id, resourceId, ownerId));
  }
  deleteWorktree(id: string, resourceId: string, confirmation: TaskDeletionConfirmation, ownerId: number) {
    return this.serialize(() => this.worktreeDeletion.remove(id, resourceId, confirmation, ownerId));
  }
  deleteNote(id: string, noteId: string, expectedVersion: number, authorize?: () => void) {
    return diagnosticOperation("task.note.delete", { taskId: id }, () => this.serialize(() => this.resourceBindings.deleteNote(id, noteId, expectedVersion, authorize)));
  }

  private attachmentDirectory(id: string) {
    if (!REQUEST_ID.test(id)) throw new Error("TASK_INVALID");
    return path.join(this.userData, "task-files", this.namespace, id);
  }

  async inspectResource(id: string) {
    const resource = (await this.resources.list()).find((item) => item.id === id);
    if (!resource || !resource.available) throw new Error("RESOURCE_NOT_FOUND");
    return inspectTaskResource(resource);
  }

  load(): Promise<TaskBootstrap> {
    return diagnosticOperation("task.load", {}, async () => {
      return this.serialize(async () => {
        if (!this.recovered) {
          for (const operation of await this.repository.operations()) {
            if (operation.state !== "pending") continue;
            const manifest: TaskCreationManifest = JSON.parse(operation.manifest);
            // SQLite 无法撤销 Git / 文件系统操作；无法确认安全的中断现场必须保留。
            let retained = await rollbackWorkspaces(manifest);
            if (manifest.attachmentDirectoryOwned) {
              try { await removeAttachmentDirectory(this.attachmentDirectory(operation.id)); } catch { retained = true; }
            }
            if (retained) await this.repository.recordOperation(operation.id, "retained", manifest);
            else await this.repository.clearOperation(operation.id);
          }
          this.recovered = true;
        }
        const operations = await this.repository.operations();
        return {
          tasks: await this.repository.load(),
          recoveryWarnings: operations.map((operation) => {
            const manifest: TaskCreationManifest = JSON.parse(operation.manifest);
            return manifest.steps.filter((step) => step.resource.mode !== "folder").map((step) => step.resource.workingPath + " · " + step.resource.targetBranch).join("\n") || manifest.attachmentDirectory;
          }),
        };
      });
    }, { success: false });
  }

  importLegacy(value: Task[]) {
    return diagnosticOperation("task.migrate", {}, async () => {
      return this.serialize(async () => {
        if (!Array.isArray(value) || !value.every(isTask) || new Set(value.map((task) => task.id)).size !== value.length) throw new Error("TASK_INVALID");
        return this.repository.importLegacy(value.filter((task) => !isLegacyDemoTask(task)).map((task) => ({
          id: task.id, title: task.title, date: task.date, updatedAt: task.date, projectName: task.projectName, status: task.status,
        })));
      });
    });
  }

  create(input: CreateTaskInput, ownerId: number): Promise<Task> {
    return diagnosticOperation("task.create", { taskId: input?.requestId, resourceCount: Array.isArray(input?.resources) ? input.resources.length : undefined, attachmentCount: Array.isArray(input?.attachmentIds) ? input.attachmentIds.length : undefined }, async () => {
      return this.serialize(async () => {
        validateCreateInput(input);
        const existing = (await this.repository.load())?.find((task) => task.id === input.requestId);
        if (existing) return existing;
        if ((await this.repository.operations()).some((operation) => operation.id === input.requestId)) throw new Error("TASK_CREATE_RETAINED");
        if (input.agent && !this.resolveAgent) throw new Error("TASK_AGENT_UNAVAILABLE");
        const agent = input.agent && this.resolveAgent ? await this.resolveAgent(input.agent) : undefined;
        const settings = this.getSettings();
        const selectedFiles = await this.files.prepare(ownerId, input.attachmentIds);
        const infos = await Promise.all(input.resources.map((resource) => this.inspectResource(resource.resourceId)));
        const manifest: TaskCreationManifest = {
          workspaceDirectory: resolveResourcePath(settings.worktreesDirectory), workspaceDirectoryShared: true,
          workspaceDirectoryOwned: false, attachmentDirectory: this.attachmentDirectory(input.requestId),
          attachmentDirectoryOwned: false, steps: [],
        };
        for (let index = 0; index < infos.length; index += 1) {
          manifest.steps.push(await prepareWorkspace(infos[index], input.resources[index], settings.branchPrefix, manifest.workspaceDirectory, manifest.steps.map((step) => step.resource.workingPath)));
        }
        manifest.steps = await assignWorkspaceIdentities(manifest.steps, []);
        const persist = () => this.repository.recordOperation(input.requestId, "pending", manifest);
        await persist();
        try {
          if (selectedFiles.length) {
            await createAttachmentDirectory(manifest.attachmentDirectory);
            manifest.attachmentDirectoryOwned = true;
            await persist();
          }
          const attachments = await this.files.copy(manifest.attachmentDirectory, selectedFiles);
          await createWorkspaceDirectory(manifest, persist);
          for (const step of manifest.steps) {
            if (step.resource.mode === "worktree" || step.resource.mode === "new-branch") {
              await diagnosticOperation(step.resource.mode === "worktree" ? "worktree.create" : "branch.create",
                { resourceId: step.resource.resourceId }, () => createWorkspace(step, persist), { started: true });
            } else await createWorkspace(step, persist);
          }
          const resources = manifest.steps.map((step) => step.resource);
          const description = input.description.trim();
          const createdAt = new Date().toISOString();
          const task: Task = {
            ...(agent ? { agent } : {}),
            id: input.requestId, title: Array.from(description.split(/\r?\n/)[0].trim()).slice(0, 80).join(""),
            description, date: createdAt, updatedAt: createdAt, projectName: resources[0]?.name ?? "", status: "TODO",
            resources, links: input.links, webLinks: (input.webLinks ?? []).map(({ id, url, title }) => ({ id, url, title: title.trim() })),
            attachments: attachments.map(({ id, name, size }) => ({ id, name, size })),
          };
          const initialization = planWorktreeInitialization(manifest.steps, await this.resources.list());
          await this.repository.create(task, attachments, initialization);
          task.contextVersion = 1;
          task.initialization = initialization.map(({ id, resourceId, name, status }) => ({ id, resourceId, name, status }));
          this.files.release(ownerId, input.attachmentIds);
          return task;
        } catch (error) {
          let retained = await rollbackWorkspaces(manifest);
          if (manifest.attachmentDirectoryOwned) {
            try { await removeAttachmentDirectory(manifest.attachmentDirectory); } catch { retained = true; }
          }
          if (retained) {
            void writeDiagnosticEvent("task.cleanup_retained", { taskId: input.requestId, resourceCount: manifest.steps.length });
            await this.repository.recordOperation(input.requestId, "retained", manifest);
            throw new Error("TASK_CREATE_RETAINED");
          }
          await this.repository.clearOperation(input.requestId);
          throw error;
        }
      });
    }, { started: true });
  }

  rename(id: string, title: string) {
    return diagnosticOperation("task.rename", { taskId: id }, async () => {
      return this.serialize(async () => {
        if (typeof title !== "string" || !title.trim() || title.trim().length > 160) throw new Error("TASK_INVALID_TITLE");
        return this.repository.update((tasks) => {
          requireTask(tasks, id);
          return tasks.map((task) => task.id === id ? { ...task, title: title.trim() } : task);
        });
      });
    });
  }

  move(id: string, status: TaskStatus, beforeTaskId: string | null) {
    if (status === "ARCHIVED") return this.archive(id, undefined, 0, beforeTaskId);
    return diagnosticOperation("task.move", { taskId: id, status }, async () => {
      return this.serialize(() => this.repository.update((tasks) => {
        requireTask(tasks, id);
        if (!TASK_STATUSES.includes(status) || (beforeTaskId !== null && typeof beforeTaskId !== "string")) throw new Error("TASK_INVALID");
        return moveTask(tasks, id, status, beforeTaskId);
      }));
    });
  }

  restore(id: string) {
    return diagnosticOperation("task.restore", { taskId: id }, async () => {
      return this.serialize(() => this.repository.update((tasks) => {
        const task = requireTask(tasks, id);
        return task.status === "ARCHIVED" ? moveTask(tasks, id, task.archivedFrom ?? "TODO", null) : tasks;
      }));
    });
  }

  inspectDeletion(id: string, options: TaskDeletionOptions, ownerId = 0, action: import("../../shared/taskDeletionTypes").TaskCleanupAction = "delete") {
    return this.serialize(() => this.deletion.preview(id, options, ownerId, action));
  }

  archive(id: string, confirmation?: TaskDeletionConfirmation, ownerId = 0, beforeTaskId: string | null = null) {
    if (beforeTaskId !== null && typeof beforeTaskId !== "string") return Promise.reject(new Error("TASK_INVALID"));
    return diagnosticOperation("task.archive", { taskId: id }, () => this.serialize(() => this.deletion.archive(id, confirmation, ownerId, beforeTaskId)), { started: true });
  }

  remove(id: string, confirmation?: TaskDeletionConfirmation, ownerId = 0) {
    return diagnosticOperation("task.delete", { taskId: id }, async () => {
      return this.serialize(() => this.deletion.remove(id, confirmation, ownerId, async () => {
        if (REQUEST_ID.test(id)) await removeAttachmentDirectory(this.attachmentDirectory(id));
      }));
    }, { started: true });
  }

  async previewAttachment(taskId: string, attachmentId: string) {
    const storageName = await this.repository.attachment(taskId, attachmentId);
    if (!storageName || path.basename(storageName) !== storageName) return null;
    return attachmentPreview(path.join(this.attachmentDirectory(taskId), storageName));
  }
}

function requireTask(tasks: Task[], id: string) {
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error("TASK_NOT_FOUND");
  return task;
}

function validateCreateInput(value: CreateTaskInput) {
  if (!value || typeof value !== "object" || !REQUEST_ID.test(value.requestId)
    || (value.agent !== undefined && !isTaskAgentSelection(value.agent))
    || typeof value.description !== "string" || !value.description.trim() || value.description.length > 100000
    || !Array.isArray(value.resources) || !value.resources.every(isTaskResourceInput)
    || !Array.isArray(value.links) || !value.links.every(isIssueItem)
    || (value.webLinks !== undefined && (!Array.isArray(value.webLinks) || !value.webLinks.every(isTaskWebLink)
      || new Set(value.webLinks.map((item) => item.id)).size !== value.webLinks.length))
    || !Array.isArray(value.attachmentIds) || !value.attachmentIds.every((id) => typeof id === "string" && REQUEST_ID.test(id))
    || new Set(value.links.map((item) => item.id)).size !== value.links.length
    || new Set(value.attachmentIds).size !== value.attachmentIds.length) throw new Error("TASK_INVALID");
}
