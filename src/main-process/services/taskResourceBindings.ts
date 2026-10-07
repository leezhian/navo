import type { AddTaskResourcesInput } from "../../shared/taskResourceTypes";
import { isIssueItem } from "../../utils/adeDataValidation";
import { isTaskWebLink } from "../../utils/taskWebLinks";
import { TaskRepository } from "./taskRepository";
import { TaskResourceRepository } from "./taskResourceRepository";
import { TaskFileSelections } from "./taskFileSelections";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function validate(input: AddTaskResourcesInput) {
  if (!input || typeof input !== "object" || typeof input.requestId !== "string" || !UUID.test(input.requestId)
    || !Array.isArray(input.links) || input.links.length > 100 || !input.links.every(isIssueItem)
    || !Array.isArray(input.webLinks) || input.webLinks.length > 100 || !input.webLinks.every(isTaskWebLink)
    || !Array.isArray(input.notes) || input.notes.length > 20 || !input.notes.every((note) => note && typeof note.id === "string" && UUID.test(note.id) && typeof note.title === "string" && note.title.length <= 160 && typeof note.content === "string" && Boolean(note.content.trim()) && note.content.length <= 100000)
    || !Array.isArray(input.fileIds) || input.fileIds.length > 20 || !input.fileIds.every((id) => typeof id === "string" && UUID.test(id))) throw new Error("TASK_INVALID");
  for (const ids of [input.links.map((item) => item.id), input.webLinks.map((item) => item.id), input.notes.map((item) => item.id), input.fileIds]) if (new Set(ids).size !== ids.length) throw new Error("TASK_INVALID");
  if (!input.links.length && !input.webLinks.length && !input.notes.length && !input.fileIds.length) throw new Error("TASK_INVALID");
}

export class TaskResourceBindings {
  readonly files = new TaskFileSelections();
  private readonly resources: TaskResourceRepository;
  constructor(private readonly tasks: TaskRepository, filename: string, namespace: string) { this.resources = new TaskResourceRepository(filename, namespace); }
  private async task(id: string) {
    if (typeof id !== "string") throw new Error("TASK_INVALID");
    const task = (await this.tasks.load())?.find((item) => item.id === id);
    if (!task) throw new Error("TASK_NOT_FOUND");
    return task;
  }
  async add(taskId: string, input: AddTaskResourcesInput, ownerId: number) {
    validate(input);
    const task = await this.task(taskId);
    if (await this.resources.hasBatch(taskId, input.requestId)) return task;
    const files = await this.files.prepare(ownerId, input.fileIds);
    await this.resources.append(taskId, input, files);
    this.files.release(ownerId, input.fileIds);
    return this.task(taskId);
  }
  async filePath(taskId: string, fileId: string) {
    const file = (await this.task(taskId)).files?.find((item) => item.id === fileId);
    if (!file) throw new Error("TASK_ATTACHMENT_MISSING");
    return file.path;
  }
}
