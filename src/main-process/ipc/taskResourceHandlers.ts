import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { stat } from "node:fs/promises";
import type { AddTaskResourcesInput, TaskNote } from "../../shared/taskResourceTypes";
import { ipcChannels } from "../../shared/ipcChannels";
import type { TaskService } from "../services/taskService";
import type { TaskResourceRemoval } from "../../shared/taskContextTypes";
import { withIdleTaskWorkspace, initializeTask } from "./taskSessionHandlers";
import { publishTask } from "./taskEvents";
import { writeDiagnosticEvent } from "../diagnostics/diagnosticLogger";

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
    owner(event);return tasks.addResources(taskId, input, event.sender.id).then((task) => {
      publishTask(task);
      if (input.resources) void initializeTask(task, event.sender).catch((error) => writeDiagnosticEvent("session.start.failed", { taskId, error }));
      return task;
    });
  });
  ipcMain.handle(ipcChannels.tasksUpdateNote, (event, taskId: string, note: TaskNote, expected?: TaskNote) => {
    owner(event);return tasks.updateNote(taskId, note, expected).then(publishTask);
  });
  ipcMain.handle(ipcChannels.tasksDeleteNote, (event, taskId: string, noteId: string) => {
    owner(event);return tasks.deleteNote(taskId, noteId).then(publishTask);
  });
  ipcMain.handle(ipcChannels.tasksUpdatePrompt, (event, taskId: string, content: string, expected: string) => {
    owner(event); return tasks.updatePrompt(taskId, content, expected).then(publishTask);
  });
  ipcMain.handle(ipcChannels.tasksDetachResource, (event, taskId: string, input: TaskResourceRemoval) => {
    owner(event);
    const remove = () => tasks.detachResource(taskId, input).then(publishTask);
    return input?.kind === "workspace" ? withIdleTaskWorkspace(taskId, input.id, remove) : remove();
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
