import { app, BrowserWindow, ipcMain, shell } from "electron";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import path from "node:path";
import { ipcChannels } from "../../shared/ipcChannels";
import type { StartTaskSessionInput } from "../../shared/taskSessionTypes";
import type { TaskService } from "../services/taskService";
import type { Task } from "../../domain/tasks";
import { SessionRepository } from "../services/taskSessions/sessionRepository";
import { TaskSessionService } from "../services/taskSessions/taskSessionService";
import { getCurrentSettings } from "../services/settingsService";
import { getAgentService } from "./agentHandlers";
import { writeDiagnosticEvent } from "../diagnostics/diagnosticLogger";
import { ResourceService } from "../services/resourceService";
import { TaskInitializationService } from "../services/taskInitializationService";
import { TaskInitializationRepository } from "../services/taskInitializationRepository";
import { publishTask, onTaskPublished } from "./taskEvents";

let sessions: TaskSessionService | null = null;
let initialization: TaskInitializationService | null = null;
let unsubscribeTasks: (() => void) | undefined;
export async function shutdownTaskSessions() { unsubscribeTasks?.(); unsubscribeTasks = undefined; await initialization?.shutdown(); await sessions?.shutdown(); }
export async function deleteTaskWithSessions<Result>(taskId: string, operation: () => Promise<Result>) {
  await initialization?.cancel(taskId);
  return sessions ? sessions.deleteTask(taskId, operation) : operation();
}
export function withIdleTaskWorkspace<Result>(taskId: string, resourceId: string, operation: () => Promise<Result>) {
  if (initialization?.isRunning(taskId)) throw new Error("TASK_WORKSPACE_BUSY");
  return sessions ? sessions.withIdleWorkspace(taskId, resourceId, operation) : operation();
}
export function startInitialTaskSession(task: Task, owner: WebContents) {
  void initializeTask(task, owner, true).catch((error) => {
    void writeDiagnosticEvent("session.start.failed", { taskId: task.id, error });
  });
}
export async function initializeTask(task: Task, owner: WebContents, startAgent = false, retry = false) {
  const success = await initialization?.run(task.id, owner, retry);
  if (success && startAgent && task.agent && !owner.isDestroyed()) await sessions?.start({ taskId: task.id, kind: "agent" }, owner, true);
}

export function registerTaskSessionHandlers(tasks: TaskService) {
  const namespace = app.isPackaged ? "production" : "development";
  const resources = new ResourceService(path.join(app.getPath("userData"), "resources.json"));
  async function task(id: string) {
    if (typeof id !== "string") throw new Error("TASK_INVALID");
    const found = (await tasks.repository.load())?.find((item) => item.id === id);
    if (!found) throw new Error("TASK_NOT_FOUND");
    return found;
  }
  function owner(event: IpcMainInvokeEvent) {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) throw new Error("SESSION_UNAVAILABLE");
    return event.sender;
  }
  const service = new TaskSessionService(new SessionRepository(path.join(app.getPath("userData"), "app.db"), namespace),
    getAgentService(), task, getCurrentSettings, (records) => {
      for (const window of BrowserWindow.getAllWindows()) if (!window.webContents.isDestroyed()) window.webContents.send(ipcChannels.taskSessionsChanged, records);
    }, async (record) => {
      const paths: string[] = [];
      for (const file of record.attachments ?? []) {
        const filename = await tasks.repository.attachment(record.id, file.id);
        if (!filename || path.basename(filename) !== filename || !/^[a-zA-Z0-9_-]{1,128}$/.test(record.id)) throw new Error("TASK_ATTACHMENT_MISSING");
        paths.push(path.join(app.getPath("userData"), "task-files", namespace, record.id, filename));
      }
      return paths;
    }, undefined, undefined, () => resources.list(), {
      create: (id, note, sessionId, authorize) => tasks.createAgentNote(id, note, sessionId, authorize).then(publishTask),
      update: (id, note, version, authorize) => tasks.updateNote(id, note, version, authorize).then(publishTask),
      remove: (id, noteId, version, authorize) => tasks.deleteNote(id, noteId, version, authorize).then(publishTask),
    });
  sessions = service;
  unsubscribeTasks?.();
  unsubscribeTasks = onTaskPublished((record) => { void service.updateTaskContext(record.id).catch(() => undefined); });
  initialization = new TaskInitializationService(new TaskInitializationRepository(path.join(app.getPath("userData"), "app.db"), namespace), service, task, publishTask);
  ipcMain.handle(ipcChannels.tasksRetryInitialization, async (event, taskId: string) => {
    const sender = owner(event);
    const record = await task(taskId);
    if (record.status === "ARCHIVED") throw new Error("TASK_BUSY");
    // 返回后立即可观察状态，不占用 IPC 等待一个长时间安装命令。
    void initializeTask(record, sender, true, true).catch((error) => writeDiagnosticEvent("session.start.failed", { taskId, error }));
  });
  ipcMain.handle(ipcChannels.taskSessionsList, (event) => { owner(event); return service.list(); });
  ipcMain.handle(ipcChannels.taskSessionsContextReminder, (event, id: string) => service.contextReminder(id, owner(event)));
  ipcMain.handle(ipcChannels.taskSessionsStart, (event, input: StartTaskSessionInput) => service.start(input, owner(event)));
  ipcMain.handle(ipcChannels.taskSessionsStop, (event, id: string) => service.stop(id, owner(event)));
  ipcMain.handle(ipcChannels.taskSessionsArchive, (event, id: string) => service.archive(id, owner(event)));
  ipcMain.handle(ipcChannels.taskSessionsRestore, (event, id: string) => service.restore(id, owner(event)));
  ipcMain.handle(ipcChannels.taskSessionsRename, (event, id: string, title: string) => service.rename(id, title, owner(event)));
  ipcMain.handle(ipcChannels.taskSessionsRemove, (event, id: string) => service.remove(id, owner(event)));
  ipcMain.handle(ipcChannels.taskSessionsRestart, (event, id: string, resume: boolean) => {
    if (typeof resume !== "boolean") throw new Error("TASK_INVALID");
    return service.restart(id, resume, owner(event));
  });
  ipcMain.handle(ipcChannels.taskSessionsOpenLink, async (event, taskId: string, id: string) => {
    owner(event);
    const link = (await task(taskId)).webLinks?.find((item) => item.id === id);
    if (!link || !["https:", "http:"].includes(new URL(link.url).protocol)) throw new Error("TASK_INVALID");
    await shell.openExternal(link.url);
  });
  ipcMain.handle(ipcChannels.taskSessionsRevealAttachment, async (event, taskId: string, id: string) => {
    owner(event); await task(taskId);
    const filename = await tasks.repository.attachment(taskId, id);
    if (!filename || path.basename(filename) !== filename || !/^[a-zA-Z0-9_-]{1,128}$/.test(taskId)) throw new Error("TASK_INVALID");
    shell.showItemInFolder(path.join(app.getPath("userData"), "task-files", namespace, taskId, filename));
  });
}
