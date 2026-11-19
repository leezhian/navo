import { app, BrowserWindow, ipcMain } from "electron";
import { ipcChannels } from "../../shared/ipcChannels";
import type { TaskProgressStage } from "../../shared/taskProgress";
import type { TaskService } from "../services/taskService";
import { taskProgressInputs } from "../services/taskProgressService";
import { onTaskPublished } from "./taskEvents";

/** 前台定期读取本地 Git；资源／PR 更新及时检查，窗口隐藏后暂停轮询。 */
export function registerTaskProgressHandlers(tasks: TaskService) {
  const queue = new Set<string>();
  const inputs = new Map<string, string>();
  let running = false;
  let stopped = false;
  let loaded = false;

  async function drain() {
    if (running || stopped) return;
    running = true;
    try {
      while (queue.size && !stopped) {
        const ids = [...queue].slice(0, 2);
        ids.forEach((id) => queue.delete(id));
        await Promise.allSettled(ids.map((id) => tasks.progress.refresh(id)));
      }
    } finally { running = false; }
  }

  async function refreshAll() {
    loaded = true;
    const records = await tasks.repository.load();
    if (stopped) return;
    for (const task of records ?? []) if (task.status !== "ARCHIVED") {
      inputs.set(task.id, taskProgressInputs(task));
      queue.add(task.id);
    }
    void drain();
  }

  const unsubscribe = onTaskPublished((task) => {
    if (stopped || task.status === "ARCHIVED") return;
    const next = taskProgressInputs(task);
    if (inputs.get(task.id) === next) return;
    inputs.set(task.id, next);
    queue.add(task.id);
    void drain();
  });
  const refresh = () => { if (loaded && BrowserWindow.getFocusedWindow()) void refreshAll().catch(() => undefined); };
  const timer = setInterval(refresh, 30_000);
  timer.unref();
  app.on("browser-window-focus", refresh);
  app.once("before-quit", () => { stopped = true; clearInterval(timer); unsubscribe(); app.off("browser-window-focus", refresh); });
  ipcMain.handle(ipcChannels.tasksSetProgress, async (event, id: string, stage: TaskProgressStage | null | "reopen") => {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) throw new Error("WINDOW_UNAVAILABLE");
    const task = await tasks.progress.setStage(id, stage);
    queue.add(id);
    void drain();
    return task;
  });
  return { refreshAll };
}
