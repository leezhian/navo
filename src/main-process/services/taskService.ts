import path from "node:path";
import type { AppSettings } from "../../domain/types";
import type { Task, TaskStatus } from "../../domain/tasks";
import type { CreateTaskInput, TaskBootstrap, TaskResourceInput } from "../../shared/taskTypes";
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

const REQUEST_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TASK_STATUSES: TaskStatus[] = ["TODO", "DONE", "ARCHIVED"];

export class TaskService {
  readonly repository: TaskRepository;
  readonly files = new TaskAttachmentSelections();
  private readonly resources: ResourceService;
  private queue: Promise<unknown> = Promise.resolve();
  private recovered = false;

  constructor(private readonly userData: string, private readonly namespace: "development" | "production", private readonly getSettings: () => AppSettings) {
    this.repository = new TaskRepository(path.join(userData, "app.db"), namespace);
    this.resources = new ResourceService(path.join(userData, "resources.json"));
  }

  private serialize<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  async flush() { await this.queue; }

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
  }

  importLegacy(value: Task[]) {
    return this.serialize(async () => {
      if (!Array.isArray(value) || !value.every(isTask) || new Set(value.map((task) => task.id)).size !== value.length) throw new Error("TASK_INVALID");
      return this.repository.importLegacy(value.map((task) => ({
        id: task.id, title: task.title, date: task.date, projectName: task.projectName, status: task.status,
      })));
    });
  }

  create(input: CreateTaskInput, ownerId: number): Promise<Task> {
    return this.serialize(async () => {
      validateCreateInput(input);
      const existing = (await this.repository.load())?.find((task) => task.id === input.requestId);
      if (existing) return existing;
      if ((await this.repository.operations()).some((operation) => operation.id === input.requestId)) throw new Error("TASK_CREATE_RETAINED");
      const settings = this.getSettings();
      const selectedFiles = await this.files.prepare(ownerId, input.attachmentIds);
      const infos = await Promise.all(input.resources.map((resource) => this.inspectResource(resource.resourceId)));
      const roots = infos.map((info) => info.git?.root ?? info.path);
      if (new Set(roots).size !== roots.length) throw new Error("TASK_DUPLICATE_RESOURCE");
      const manifest: TaskCreationManifest = {
        workspaceDirectory: path.join(resolveResourcePath(settings.worktreesDirectory), input.requestId),
        workspaceDirectoryOwned: false, attachmentDirectory: this.attachmentDirectory(input.requestId),
        attachmentDirectoryOwned: false, steps: [],
      };
      for (let index = 0; index < infos.length; index += 1) {
        manifest.steps.push(await prepareWorkspace(infos[index], input.resources[index], settings.branchPrefix, manifest.workspaceDirectory, index + 1));
      }
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
        for (const step of manifest.steps) await createWorkspace(step, persist);
        const resources = manifest.steps.map((step) => step.resource);
        const description = input.description.trim();
        const task: Task = {
          id: input.requestId, title: Array.from(description.split(/\r?\n/)[0].trim()).slice(0, 80).join(""),
          description, date: new Date().toISOString(), projectName: resources[0]?.name ?? "", status: "TODO",
          resources, links: input.links, webLinks: (input.webLinks ?? []).map(({ id, url, title }) => ({ id, url, title: title.trim() })),
          attachments: attachments.map(({ id, name, size }) => ({ id, name, size })),
        };
        await this.repository.create(task, attachments);
        this.files.release(ownerId, input.attachmentIds);
        return task;
      } catch (error) {
        let retained = await rollbackWorkspaces(manifest);
        if (manifest.attachmentDirectoryOwned) {
          try { await removeAttachmentDirectory(manifest.attachmentDirectory); } catch { retained = true; }
        }
        if (retained) {
          await this.repository.recordOperation(input.requestId, "retained", manifest);
          throw new Error("TASK_CREATE_RETAINED");
        }
        await this.repository.clearOperation(input.requestId);
        throw error;
      }
    });
  }

  rename(id: string, title: string) {
    return this.serialize(async () => {
      if (typeof title !== "string" || !title.trim() || title.trim().length > 160) throw new Error("TASK_INVALID_TITLE");
      return this.repository.update((tasks) => {
        requireTask(tasks, id);
        return tasks.map((task) => task.id === id ? { ...task, title: title.trim() } : task);
      });
    });
  }

  move(id: string, status: TaskStatus, beforeTaskId: string | null) {
    return this.serialize(() => this.repository.update((tasks) => {
      requireTask(tasks, id);
      if (!TASK_STATUSES.includes(status) || (beforeTaskId !== null && typeof beforeTaskId !== "string")) throw new Error("TASK_INVALID");
      return moveTask(tasks, id, status, beforeTaskId);
    }));
  }

  restore(id: string) {
    return this.serialize(() => this.repository.update((tasks) => {
      const task = requireTask(tasks, id);
      return task.status === "ARCHIVED" ? moveTask(tasks, id, task.archivedFrom ?? "TODO", null) : tasks;
    }));
  }

  remove(id: string) {
    return this.serialize(async () => {
      const result = await this.repository.update((tasks) => { requireTask(tasks, id); return tasks.filter((task) => task.id !== id); });
      // 删除任务不删除仓库、分支或 Worktree；只清理应用管理的附件副本。
      if (REQUEST_ID.test(id)) await removeAttachmentDirectory(this.attachmentDirectory(id)).catch(() => undefined);
      return result;
    });
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
    || typeof value.description !== "string" || !value.description.trim() || value.description.length > 100000
    || !Array.isArray(value.resources) || !value.resources.every(isResourceInput)
    || !Array.isArray(value.links) || !value.links.every(isIssueItem)
    || (value.webLinks !== undefined && (!Array.isArray(value.webLinks) || !value.webLinks.every(isTaskWebLink)
      || new Set(value.webLinks.map((item) => item.id)).size !== value.webLinks.length))
    || !Array.isArray(value.attachmentIds) || !value.attachmentIds.every((id) => typeof id === "string" && REQUEST_ID.test(id))
    || new Set(value.resources.map((item) => item.resourceId)).size !== value.resources.length
    || new Set(value.links.map((item) => item.id)).size !== value.links.length
    || new Set(value.attachmentIds).size !== value.attachmentIds.length) throw new Error("TASK_INVALID");
}

function isResourceInput(value: TaskResourceInput) {
  return value && typeof value.resourceId === "string" && typeof value.sourceBranch === "string" && typeof value.targetBranch === "string"
    && ["worktree", "new-branch", "current-branch", "folder"].includes(value.mode);
}
