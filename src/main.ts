import { app, BrowserWindow } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { TRAFFIC_LIGHT_POSITION } from "./shared/windowLayout";
import { registerAppHandlers } from "./main-process/ipc/appHandlers";
import { registerReviewHandlers } from "./main-process/ipc/reviewHandlers";
import { bindWindowStateEvents, registerWindowHandlers } from "./main-process/ipc/windowHandlers";
import { runHookCollectorFromStdin } from "./main-process/services/hookCollectorService";
import type { ReviewProvider } from "./domain/types";

const hookCollectorArgs = parseHookCollectorArgs(process.argv);

if (hookCollectorArgs) {
  runHookCollectorFromStdin(hookCollectorArgs)
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
    })
    .finally(() => {
      app.exit(0);
    });
} else {
  startApplication();
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

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
    title: "Vibe Reviewer",
    vibrancy: usesNativeVibrancy ? "sidebar" : undefined,
    visualEffectState: usesNativeVibrancy ? "active" : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  bindWindowStateEvents(mainWindow);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

function startApplication() {
  app.on("ready", () => {
    registerAppHandlers();
    registerReviewHandlers();
    registerWindowHandlers();
    createWindow();
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

function parseHookCollectorArgs(argv: string[]) {
  const hookIndex = argv.indexOf("--hook");
  if (hookIndex < 0 || argv[hookIndex + 1] !== "collect") {
    return null;
  }

  const provider = readArgValue(argv, "--provider");
  if (!isReviewProvider(provider)) {
    return null;
  }

  return { provider };
}

function readArgValue(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function isReviewProvider(value: unknown): value is ReviewProvider {
  return value === "codex" || value === "claude";
}
