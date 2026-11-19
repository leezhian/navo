import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { ipcChannels } from "../../shared/ipcChannels";
import { TaskService } from "../services/taskService";
import { getCurrentSettings } from "../services/settingsService";
import type { CreateTaskInput } from "../../shared/taskTypes";
import type { Task, TaskStatus } from "../../domain/tasks";
import type { TaskCleanupAction, TaskDeletionConfirmation, TaskDeletionOptions } from "../../shared/taskDeletionTypes";
import { resolveTaskAgentSelection } from "./agentHandlers";
import { registerTaskSessionHandlers, startInitialTaskSession, deleteTaskWithSessions, archiveTaskWithSessions } from "./taskSessionHandlers";
import { registerTaskResourceHandlers } from "./taskResourceHandlers";
import { registerTaskWorkspaceOpenHandlers } from "./taskWorkspaceOpenHandlers";
import { registerTaskBranchHandlers } from "./taskBranchHandlers";
import { registerTaskProgressHandlers } from "./taskProgressHandlers";
import { publishTask } from "./taskEvents";
import path from "node:path";
import { TaskIssueLinker } from "../services/integrations/taskIssueLinker";
import { getIntegrationService } from "../services/integrations/integrationRuntime";
import { gitValue } from "../services/taskGit";
import type { IssueItem } from "../../domain/issues";

let tasks: TaskService | null = null;
let linker: TaskIssueLinker | null = null;
export async function flushTasks() { await tasks?.flush(); }
export function getTaskIssueLinker() { return linker; }

function createLinker(service: TaskService, namespace: string) {
  const integrations = getIntegrationService();
  return new TaskIssueLinker({
    filename: path.join(app.getPath("userData"), "app.db"),
    namespace,
    loadTasks: async () => (await service.repository.load()) ?? [],
    addResources: (taskId, input) => service.addResources(taskId, input, -1),
    inspectWorktree: async (workingPath) => ({
      branch: await gitValue(workingPath, ["branch", "--show-current"]).catch(() => null),
      remoteUrl: await gitValue(workingPath, ["remote", "get-url", "origin"]).catch(() => null),
    }),
    getItem: (id, options) => integrations.getItem(id, options),
    cachedPullRequests: () => integrations.cachedPullRequests(),
    viewerLogin: (item: IssueItem) => integrations.viewerLoginFor(item),
    publish: (task) => { publishTask(task); },
  });
}

export function registerTaskHandlers() {
  const service = new TaskService(app.getPath("userData"), app.isPackaged ? "production" : "development", getCurrentSettings, resolveTaskAgentSelection, publishTask);
  tasks = service;
  linker = createLinker(service, app.isPackaged ? "production" : "development");
  registerTaskResourceHandlers(service);
  registerTaskWorkspaceOpenHandlers(service);
  registerTaskBranchHandlers(service);
  registerTaskSessionHandlers(service);
  const progress = registerTaskProgressHandlers(service);
  const owners = new Set<number>();
  ipcMain.handle(ipcChannels.tasksLoad, async () => { const result = await service.load(); void progress.refreshAll().catch(() => undefined); return result; });
  ipcMain.handle(ipcChannels.tasksImportLegacy, async (_event, value: Task[]) => { const records = await service.importLegacy(value); void progress.refreshAll().catch(() => undefined); return records; });
  ipcMain.handle(ipcChannels.tasksCreate, async (event, value: CreateTaskInput) => {
    const task = await service.create(value, event.sender.id);
    startInitialTaskSession(task, event.sender);
    const issues = (task.links ?? []).filter((link) => link.group === "ISSUE" || link.group === "PR");
    if (issues.length) void linker?.afterIssuesAdded(task.id, issues).catch(() => undefined);
    return task;
  });
  ipcMain.handle(ipcChannels.tasksInspectResource, (_event, id: string) => service.inspectResource(id));
  ipcMain.handle(ipcChannels.tasksChooseFiles, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("WINDOW_UNAVAILABLE");
    const ownerId = event.sender.id;
    if (!owners.has(ownerId)) {
      owners.add(ownerId);
      event.sender.once("destroyed", () => { service.files.release(ownerId); service.deletion.forgetOwner(ownerId); owners.delete(ownerId); });
    }
    const result = await dialog.showOpenDialog(window, { defaultPath: app.getPath("home"), properties: ["openFile", "multiSelections"] });
    return result.canceled ? [] : service.files.add(ownerId, result.filePaths);
  });
  ipcMain.handle(ipcChannels.tasksReleaseFiles, (event, ids: string[]) => {
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) throw new Error("TASK_INVALID");
    service.files.release(event.sender.id, ids);
  });
  ipcMain.handle(ipcChannels.tasksPreviewAttachment, (_event, taskId: string, fileId: string) => service.previewAttachment(taskId, fileId));
  function publishUpdated(id: string, records: Task[]) {
    const task = records.find((record) => record.id === id);
    if (task) publishTask(task);
    return records;
  }
  ipcMain.handle(ipcChannels.tasksRename, (_event, id: string, title: string) => service.rename(id, title).then((records) => publishUpdated(id, records)));
  function archive(id: string, confirmation: TaskDeletionConfirmation | undefined, ownerId: number, beforeId: string | null = null) {
    const options = service.deletion.confirmationOptions(id, confirmation, ownerId, "archive");
    return archiveTaskWithSessions(id, options.deleteWorktrees, () => service.archive(id, confirmation, ownerId, beforeId)).then((records) => publishUpdated(id, records));
  }
  ipcMain.handle(ipcChannels.tasksMove, (event, id: string, status: TaskStatus, beforeId: string | null) => status === "ARCHIVED"
    ? archive(id, undefined, event.sender.id, beforeId) : service.move(id, status, beforeId).then((records) => publishUpdated(id, records)));
  ipcMain.handle(ipcChannels.tasksArchive, (event, id: string, confirmation: TaskDeletionConfirmation) => {
    if (!confirmation) throw new Error("TASK_ARCHIVE_CONFIRMATION");
    return archive(id, confirmation, event.sender.id);
  });
  ipcMain.handle(ipcChannels.tasksRestore, (_event, id: string) => service.restore(id).then((records) => publishUpdated(id, records)));
  ipcMain.handle(ipcChannels.tasksInspectDeletion, (event, id: string, options: TaskDeletionOptions, action: TaskCleanupAction = "delete") => {
    if (!owners.has(event.sender.id)) {
      const ownerId = event.sender.id;
      owners.add(ownerId);
      event.sender.once("destroyed", () => { service.files.release(ownerId); service.deletion.forgetOwner(ownerId); owners.delete(ownerId); });
    }
    return service.inspectDeletion(id, options, event.sender.id, action);
  });
  ipcMain.handle(ipcChannels.tasksRemove, (event, id: string, confirmation?: TaskDeletionConfirmation) =>
    deleteTaskWithSessions(id, () => service.remove(id, confirmation, event.sender.id)));
}
