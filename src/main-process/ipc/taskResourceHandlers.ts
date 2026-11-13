import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { stat } from "node:fs/promises";
import type { AddTaskResourcesInput, TaskNoteUpdate } from "../../shared/taskResourceTypes";
import { ipcChannels } from "../../shared/ipcChannels";
import type { TaskService } from "../services/taskService";
import type { TaskResourceRemoval } from "../../shared/taskContextTypes";
import type { TaskDeletionConfirmation } from "../../shared/taskDeletionTypes";
import { withIdleTaskWorkspace, initializeTask } from "./taskSessionHandlers";
import { publishTask } from "./taskEvents";
import { writeDiagnosticEvent } from "../diagnostics/diagnosticLogger";
import { exportTaskNote } from "../services/taskNoteExport";

export function registerTaskResourceHandlers(tasks: TaskService) {
  const owners = new Set<number>();
  function owner(event: IpcMainInvokeEvent) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || event.senderFrame !== event.sender.mainFrame) throw new Error("WINDOW_UNAVAILABLE");
    if (!owners.has(event.sender.id)) {
      owners.add(event.sender.id);
      event.sender.once("destroyed", () => { tasks.resourceBindings.files.release(event.sender.id); tasks.worktreeDeletion.forgetOwner(event.sender.id); owners.delete(event.sender.id); });
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
  ipcMain.handle(ipcChannels.tasksUpdateNote, (event, taskId: string, note: TaskNoteUpdate, expectedVersion: number) => {
    owner(event);return tasks.updateNote(taskId, note, expectedVersion).then(publishTask);
  });
  ipcMain.handle(ipcChannels.tasksExportNote, async (event, taskId: string, noteId: string, version?: number) => {
    const window = owner(event);
    if (typeof taskId !== "string" || typeof noteId !== "string") throw new Error("TASK_INVALID");
    const task = (await tasks.repository.load())?.find((item) => item.id === taskId);
    if (!task) throw new Error("TASK_NOT_FOUND");
    const snapshot = version === undefined ? undefined : (await tasks.noteHistory(taskId, noteId)).find((item) => item.version === version);
    if (version !== undefined && !snapshot) throw new Error("TASK_NOTE_NOT_FOUND");
    return exportTaskNote(window, task, noteId, snapshot);
  });
  ipcMain.handle(ipcChannels.tasksDeleteNote, (event, taskId: string, noteId: string, expectedVersion: number) => {
    owner(event);return tasks.deleteNote(taskId, noteId, expectedVersion).then(publishTask);
  });
  ipcMain.handle(ipcChannels.tasksUpdatePrompt, (event, taskId: string, content: string, expected: string, version?: number) => {
    owner(event); return tasks.updatePrompt(taskId, content, expected, version).then(publishTask);
  });
  ipcMain.handle(ipcChannels.tasksNoteHistory, (event, taskId: string, noteId: string) => { owner(event); return tasks.noteHistory(taskId, noteId); });
  ipcMain.handle(ipcChannels.tasksRestoreNote, (event, taskId: string, noteId: string, version: number, expected: number) => {
    owner(event); return tasks.restoreNote(taskId, noteId, version, expected).then(publishTask);
  });
  ipcMain.handle(ipcChannels.tasksCommentNote, (event, taskId: string, input: import("../../shared/taskNoteTypes").TaskNoteCommentInput) => {
    owner(event); return tasks.commentNote(taskId, input).then(publishTask);
  });
  ipcMain.handle(ipcChannels.tasksChangeNoteComment, (event, taskId: string, id: string, expected: string, patch: { body?: string; resolved?: boolean; remove?: boolean }) => {
    owner(event); return tasks.changeNoteComment(taskId, id, expected, patch).then(publishTask);
  });
  ipcMain.handle(ipcChannels.tasksDetachResource, (event, taskId: string, input: TaskResourceRemoval) => {
    owner(event);
    const remove = () => tasks.detachResource(taskId, input).then(publishTask);
    return input?.kind === "workspace" ? withIdleTaskWorkspace(taskId, input.id, remove) : remove();
  });
  ipcMain.handle(ipcChannels.tasksInspectWorktreeDeletion, (event, taskId: string, resourceId: string) => {
    owner(event);
    return withIdleTaskWorkspace(taskId, resourceId, () => tasks.inspectWorktreeDeletion(taskId, resourceId, event.sender.id));
  });
  ipcMain.handle(ipcChannels.tasksDeleteWorktree, (event, taskId: string, resourceId: string, confirmation: TaskDeletionConfirmation) => {
    owner(event);
    return withIdleTaskWorkspace(taskId, resourceId, () => tasks.deleteWorktree(taskId, resourceId, confirmation, event.sender.id).then(publishTask));
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
