import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { ipcChannels } from "../../shared/ipcChannels";
import { TaskService } from "../services/taskService";
import { getCurrentSettings } from "../services/settingsService";
import type { CreateTaskInput } from "../../shared/taskTypes";
import type { Task, TaskStatus } from "../../domain/tasks";
import type { TaskDeletionConfirmation, TaskDeletionOptions } from "../../shared/taskDeletionTypes";
import { resolveTaskAgentSelection } from "./agentHandlers";

let tasks: TaskService | null = null;
export async function flushTasks() { await tasks?.flush(); }

export function registerTaskHandlers() {
  const service = new TaskService(app.getPath("userData"), app.isPackaged ? "production" : "development", getCurrentSettings, resolveTaskAgentSelection);
  tasks = service;
  const owners = new Set<number>();
  ipcMain.handle(ipcChannels.tasksLoad, () => service.load());
  ipcMain.handle(ipcChannels.tasksImportLegacy, (_event, value: Task[]) => service.importLegacy(value));
  ipcMain.handle(ipcChannels.tasksCreate, (event, value: CreateTaskInput) => service.create(value, event.sender.id));
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
  ipcMain.handle(ipcChannels.tasksRename, (_event, id: string, title: string) => service.rename(id, title));
  ipcMain.handle(ipcChannels.tasksMove, (_event, id: string, status: TaskStatus, beforeId: string | null) => service.move(id, status, beforeId));
  ipcMain.handle(ipcChannels.tasksRestore, (_event, id: string) => service.restore(id));
  ipcMain.handle(ipcChannels.tasksInspectDeletion, (event, id: string, options: TaskDeletionOptions) => {
    if (!owners.has(event.sender.id)) {
      const ownerId = event.sender.id;
      owners.add(ownerId);
      event.sender.once("destroyed", () => { service.files.release(ownerId); service.deletion.forgetOwner(ownerId); owners.delete(ownerId); });
    }
    return service.inspectDeletion(id, options, event.sender.id);
  });
  ipcMain.handle(ipcChannels.tasksRemove, (event, id: string, confirmation?: TaskDeletionConfirmation) => service.remove(id, confirmation, event.sender.id));
}
