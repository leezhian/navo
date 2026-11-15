import { BrowserWindow, ipcMain } from "electron";
import { ipcChannels } from "../../shared/ipcChannels";
import type { TaskService } from "../services/taskService";
import { TaskBranchService } from "../services/taskBranchService";
import { ChangeGitStatusService } from "../services/changeGitStatusService";

export function registerTaskBranchHandlers(tasks: TaskService) {
  const service = new TaskBranchService(() => tasks.repository.load());
  const changeGit = new ChangeGitStatusService(() => tasks.repository.load());
  ipcMain.handle(ipcChannels.tasksLoadBranch, (event, taskId: string, resourceId: string) => {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) throw new Error("WINDOW_UNAVAILABLE");
    return service.load(taskId, resourceId);
  });
  ipcMain.handle(ipcChannels.tasksInspectChangeGitStatus, (event, taskId: string, resourceId: string) => {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) throw new Error("WINDOW_UNAVAILABLE");
    return changeGit.inspect(taskId, resourceId);
  });
}
