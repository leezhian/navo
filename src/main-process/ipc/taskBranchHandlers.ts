import { BrowserWindow, ipcMain } from "electron";
import { ipcChannels } from "../../shared/ipcChannels";
import type { TaskService } from "../services/taskService";
import { TaskBranchService } from "../services/taskBranchService";

export function registerTaskBranchHandlers(tasks: TaskService) {
  const service = new TaskBranchService(() => tasks.repository.load());
  ipcMain.handle(ipcChannels.tasksLoadBranch, (event, taskId: string, resourceId: string) => {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) throw new Error("WINDOW_UNAVAILABLE");
    return service.load(taskId, resourceId);
  });
}
