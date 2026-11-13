import { BrowserWindow, ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import type { TaskService } from "../services/taskService";
import { TaskWorkspaceOpenService } from "../services/taskWorkspaceOpenService";
import type { WorkspaceOpenTarget } from "../../shared/workspaceOpenTypes";
import { ipcChannels } from "../../shared/ipcChannels";

export function registerTaskWorkspaceOpenHandlers(tasks: TaskService) {
  const service = new TaskWorkspaceOpenService(() => tasks.repository.load());
  function requireOwner(event: IpcMainInvokeEvent) {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) throw new Error("WINDOW_UNAVAILABLE");
  }
  ipcMain.handle(ipcChannels.tasksWorkspaceOpenOptions, (event, taskId: string, resourceId: string) => { requireOwner(event);return service.options(taskId, resourceId); });
  ipcMain.handle(ipcChannels.tasksOpenWorkspace, (event, taskId: string, resourceId: string, target: WorkspaceOpenTarget) => { requireOwner(event);return service.open(taskId, resourceId, target); });
}
