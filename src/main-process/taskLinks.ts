import { app, ipcMain, type BrowserWindow } from "electron";
import { ipcChannels } from "../shared/ipcChannels";
import { parseTaskLink, TASK_LINK_SCHEME, type TaskLinkTarget } from "../shared/taskLinks";

/** 冷启动期间保留最后一次定位请求，等任务数据与监听器就绪后再交付。 */
export function registerTaskLinks(openWindow: () => BrowserWindow | undefined) {
  let pendingTarget: TaskLinkTarget | null = null;
  let window: BrowserWindow | undefined;
  let rendererReady = false;

  function deliver() {
    if (!pendingTarget || !rendererReady || !window || window.isDestroyed()) return;
    window.webContents.send(ipcChannels.appOpenTask, pendingTarget);
    pendingTarget = null;
  }

  function receive(url: string) {
    const request = parseTaskLink(url);
    if (!request) return false;
    pendingTarget = request;
    const target = openWindow();
    if (target) {
      if (target.isMinimized()) target.restore();
      target.show();
      target.focus();
    }
    deliver();
    return true;
  }

  app.on("open-url", (event, url) => {
    if (receive(url)) event.preventDefault();
  });
  app.on("second-instance", (_event, argv) => {
    const link = argv.find((arg) => parseTaskLink(arg) !== null);
    if (link) receive(link);
    else {
      const target = openWindow();
      if (target?.isMinimized()) target.restore();
      target?.show();
      target?.focus();
    }
  });
  ipcMain.handle(ipcChannels.appTaskLinksReady, (event) => {
    // 只向当前应用主窗口发送任务 ID，不接收渲染进程提供的路由或 URL。
    if (event.sender !== window?.webContents) return;
    rendererReady = true;
    deliver();
  });

  for (const arg of process.argv) {
    const request = parseTaskLink(arg);
    if (request) pendingTarget = request;
  }

  return {
    openLink: receive,
    bindWindow(target: BrowserWindow) {
      window = target;
      rendererReady = false;
      target.webContents.on("did-start-loading", () => { rendererReady = false; });
      target.on("closed", () => { if (window === target) { window = undefined; rendererReady = false; } });
    },
    registerProtocol() {
      // 开发时不把系统协议指向通用 Electron 宿主；macOS 的注册声明由打包配置提供。
      if (app.isPackaged) app.setAsDefaultProtocolClient(TASK_LINK_SCHEME);
    },
  };
}
