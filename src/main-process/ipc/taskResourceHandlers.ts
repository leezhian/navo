import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { stat } from "node:fs/promises";
import type { AddTaskResourcesInput } from "../../shared/taskResourceTypes";
import { ipcChannels } from "../../shared/ipcChannels";
import type { TaskService } from "../services/taskService";

export function registerTaskResourceHandlers(tasks: TaskService) {
  const owners = new Set<number>();
  function owner(event: IpcMainInvokeEvent) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || event.senderFrame !== event.sender.mainFrame) throw new Error("WINDOW_UNAVAILABLE");
    if (!owners.has(event.sender.id)) {
      owners.add(event.sender.id);
      event.sender.once("destroyed", () => { tasks.resourceBindings.files.release(event.sender.id); owners.delete(event.sender.id); });
    }
    return window;
  }
  ipcMain.handle(ipcChannels.tasksAddResources, (event, taskId: string, input: AddTaskResourcesInput) => {
    owner(event);return tasks.addResources(taskId, input, event.sender.id);
  });
  ipcMain.handle(ipcChannels.tasksChooseResourceFile, async (event) => {
    const result = await dialog.showOpenDialog(owner(event), { defaultPath: app.getPath("home"), properties: ["openFile"] });
    if (event.sender.isDestroyed() || result.canceled || !result.filePaths[0]) return null;
    const file = await tasks.resourceBindings.files.select(event.sender.id, result.filePaths[0]);
    if (event.sender.isDestroyed()) { tasks.resourceBindings.files.release(event.sender.id); return null; }
    return file;
  });
  ipcMain.handle(ipcChannels.tasksReleaseResourceFiles, (event, ids: string[]) => {
    owner(event);
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) throw new Error("TASK_INVALID");
    tasks.resourceBindings.files.release(event.sender.id, ids);
  });
  ipcMain.handle(ipcChannels.tasksRevealResourceFile, async (event, taskId: string, id: string) => {
    owner(event);
    const filename = await tasks.resourceBindings.filePath(taskId, id);
    if (!(await stat(filename)).isFile()) throw new Error("TASK_ATTACHMENT_MISSING");
    shell.showItemInFolder(filename);
  });
}
