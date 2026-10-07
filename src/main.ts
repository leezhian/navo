import { app, BrowserWindow } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import started from "electron-squirrel-startup";
import { TRAFFIC_LIGHT_POSITION } from "./shared/windowLayout";
import { bindDevelopmentTools } from "./main-process/developmentTools";
import { registerAppHandlers } from "./main-process/ipc/appHandlers";
import { flushAgentSettings, registerAgentHandlers } from "./main-process/ipc/agentHandlers";
import { registerReviewHandlers } from "./main-process/ipc/reviewHandlers";
import { destroyAllTerminals, registerTerminalHandlers } from "./main-process/ipc/terminalHandlers";
import { bindWindowStateEvents, registerWindowHandlers } from "./main-process/ipc/windowHandlers";
import { stopAllProjectWatchers } from "./main-process/services/projectChangeWatcher";
import { flushTasks, registerTaskHandlers } from "./main-process/ipc/taskHandlers";
import { shutdownTaskSessions } from "./main-process/ipc/taskSessionHandlers";
import { registerSettingsHandlers, stopResourceOperations } from "./main-process/ipc/settingsHandlers";
import { flushDiagnosticLog, initializeDiagnosticLog, writeDiagnosticEvent } from "./main-process/services/diagnosticLogService";
import { bindProcessDiagnostics, bindWindowDiagnostics, registerDiagnosticHandlers } from "./main-process/diagnostics/diagnosticRuntime";
import { flushSettings, getCurrentSettings, loadSettings } from "./main-process/services/settingsService";
import { updateApplicationMenu } from "./main-process/applicationMenu";
import { startReviewSessionWatcher, stopReviewSessionWatcher } from "./main-process/services/reviewSessionWatcher";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// 更名后沿用已有用户目录，保留本地偏好；新安装使用 Navo 的默认目录。
const legacyUserDataPath = path.join(app.getPath("appData"), "vibe-reviewer");
if (!existsSync(app.getPath("userData")) && existsSync(legacyUserDataPath)) {
  app.setPath("userData", legacyUserDataPath);
}

// 打包后图标由 Forge 复制到 resources；开发时直接读取项目素材。
const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, "icon.png")
  : path.join(app.getAppPath(), "assets/icons/icon.png");

bindProcessDiagnostics();
startApplication();

const createWindow = () => {
  const usesNativeVibrancy = process.platform === "darwin";
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 480,
    minHeight: 600,
    backgroundColor: usesNativeVibrancy ? "#00000000" : "#ffffff",
    transparent: usesNativeVibrancy,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: TRAFFIC_LIGHT_POSITION,
    title: "Navo",
    icon: appIconPath,
    vibrancy: usesNativeVibrancy ? "sidebar" : undefined,
    visualEffectState: usesNativeVibrancy ? "active" : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  bindWindowStateEvents(mainWindow);
  bindWindowDiagnostics(mainWindow);
  bindDevelopmentTools(mainWindow, Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL));

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

function startApplication() {
  app.on("ready", async () => {
    // 开发时运行的是 Electron 通用宿主，需要显式替换 Dock 图标。
    if (process.platform === "darwin" && !app.isPackaged) {
      app.dock?.setIcon(appIconPath);
    }
    try { await loadSettings(); } catch { console.error("Settings could not be loaded"); }
    initializeDiagnosticLog();
    registerDiagnosticHandlers();
    updateApplicationMenu(getCurrentSettings().locale);
    registerSettingsHandlers();
    registerAgentHandlers();
    registerTaskHandlers();
    void writeDiagnosticEvent("app.started", { version: app.getVersion(), platform: process.platform });
    registerAppHandlers();
    registerReviewHandlers();
    registerTerminalHandlers();
    registerWindowHandlers();
    startReviewSessionWatcher().catch((error: unknown) => {
      void writeDiagnosticEvent("app.watcher_failed", { error });
    });
    createWindow();
  });

  let shutdownComplete = false;
  let shutdownStarted = false;
  app.on("before-quit", (event) => {
    if (shutdownComplete) return;
    event.preventDefault();
    if (shutdownStarted) return;
    shutdownStarted = true;
    const stoppedResources = stopResourceOperations();
    stopReviewSessionWatcher();
    stopAllProjectWatchers();
    // 等待设置与日志队列完成再退出；磁盘异常不阻塞无限等待。
    const finishShutdown = async () => {
      await shutdownTaskSessions();
      destroyAllTerminals();
      await shutdownTaskSessions();
      await Promise.allSettled([stoppedResources, flushSettings(), flushTasks(), flushAgentSettings()]);
      await writeDiagnosticEvent("app.stopped");
      await flushDiagnosticLog();
    };
    void Promise.race([finishShutdown(), new Promise((resolve) => setTimeout(resolve, 5000))]).finally(() => {
      shutdownComplete = true;
      app.quit();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}
