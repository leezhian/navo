import { BrowserWindow } from "electron";
import type { Task } from "../../domain/tasks";
import { ipcChannels } from "../../shared/ipcChannels";

const listeners = new Set<(task: Task) => void>();
/** 任务提交后的进程内通知；监听方负责自己的异步错误和退出清理。 */
export function onTaskPublished(listener: (task: Task) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishTask(task: Task) {
  for (const listener of listeners) listener(task);
  for (const window of BrowserWindow.getAllWindows()) if (!window.webContents.isDestroyed()) window.webContents.send(ipcChannels.tasksChanged, task);
  return task;
}
