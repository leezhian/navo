import { app, BrowserWindow } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import started from "electron-squirrel-startup";
import { TRAFFIC_LIGHT_POSITION } from "./shared/windowLayout";
import { bindDevelopmentTools } from "./main-process/developmentTools";
import { registerAppHandlers } from "./main-process/ipc/appHandlers";
import { registerReviewHandlers } from "./main-process/ipc/reviewHandlers";
import { destroyAllTerminals, registerTerminalHandlers } from "./main-process/ipc/terminalHandlers";
import { bindWindowStateEvents, registerWindowHandlers } from "./main-process/ipc/windowHandlers";
import { stopAllProjectWatchers } from "./main-process/services/projectChangeWatcher";
import { registerSettingsHandlers, stopResourceOperations } from "./main-process/ipc/settingsHandlers";
import { writeDiagnosticEvent } from "./main-process/services/diagnosticLogService";
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
    vibrancy: usesNativeVibrancy ? "sidebar" : undefined,
    visualEffectState: usesNativeVibrancy ? "active" : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  bindWindowStateEvents(mainWindow);
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
    try { await loadSettings(); } catch { console.error("Settings could not be loaded"); }
    updateApplicationMenu(getCurrentSettings().locale);
    registerSettingsHandlers();
    void writeDiagnosticEvent("app-start");
    registerAppHandlers();
    registerReviewHandlers();
    registerTerminalHandlers();
    registerWindowHandlers();
    startReviewSessionWatcher().catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
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
    destroyAllTerminals();
    // 等待设置与日志队列完成再退出；磁盘异常不阻塞无限等待。
    void Promise.race([Promise.all([stoppedResources, flushSettings(), writeDiagnosticEvent("app-stop")]), new Promise((resolve) => setTimeout(resolve, 5000))]).finally(() => {
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
