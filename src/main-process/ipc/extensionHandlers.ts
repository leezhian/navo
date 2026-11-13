import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { ipcChannels } from "../../shared/ipcChannels";
import { ExtensionRepository } from "../services/extensions/extensionRepository";
import { ExtensionService } from "../services/extensions/extensionService";
import { TraceRuntime } from "../services/extensions/traceRuntime";
import { SessionRepository } from "../services/taskSessions/sessionRepository";
import release from "../services/extensions/sessionTraceRelease.json";

let extension: ExtensionService | undefined;
export async function registerExtensionHandlers() {
  const namespace = app.isPackaged ? "production" : "development",
    data = app.getPath("userData");
  const repository = new ExtensionRepository(path.join(data, "app.db"), namespace);
  const sessions = new SessionRepository(path.join(data, "app.db"), namespace);
  const runtime: TraceRuntime = new TraceRuntime(
    () => service,
    async (id) => (await sessions.load()).find((record) => record.id === id),
    (owner, update) => {
      const window = BrowserWindow.getAllWindows().find((window) => window.webContents.id === owner);
      window?.webContents.send(ipcChannels.traceChanged, update);
    },
  );
  const service: ExtensionService = new ExtensionService(
    path.join(data, "extensions", namespace, "session-trace"),
    repository,
    release,
    (status) => {
      for (const window of BrowserWindow.getAllWindows())
        if (!window.webContents.isDestroyed()) window.webContents.send(ipcChannels.extensionsChanged, status);
    },
    () => runtime.closeAll(),
    Number(app.getVersion().split(".")[0]),
  );
  extension = service;
  let initializationError = false;
  try {
    await service.initialize();
    service.startUpdateChecks();
  } catch {
    initializationError = true;
  }
  const owners = new Set<number>();
  function owner(event: IpcMainInvokeEvent) {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) throw Error("EXTENSION_UNAVAILABLE");
    if (initializationError) throw Error("INVALID_STORAGE");
    if (!owners.has(event.sender.id)) {
      const id = event.sender.id;
      owners.add(id);
      event.sender.once("destroyed", () => {
        runtime.closeOwner(id);
        owners.delete(id);
      });
    }
    return event.sender.id;
  }
  ipcMain.handle(ipcChannels.extensionsStatus, (event) => {
    owner(event);
    return service.status;
  });
  ipcMain.handle(ipcChannels.extensionsCheckUpdates, (event) => {
    owner(event);
    return service.checkForUpdates();
  });
  ipcMain.handle(ipcChannels.extensionsUpdate, (event) => {
    owner(event);
    return service.update();
  });
  ipcMain.handle(ipcChannels.extensionsInstall, async (event, source) => {
    owner(event);
    if (source !== "file" && source !== "download") throw Error("INVALID_QUERY");
    let filename: string | undefined;
    if (source === "file") {
      const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender) as BrowserWindow, {
        properties: ["openFile"],
        filters: [{ name: "Navo extension", extensions: ["navo-extension"] }],
      });
      if (result.canceled) return;
      filename = result.filePaths[0];
    }
    return service.install(filename);
  });
  ipcMain.handle(ipcChannels.extensionsCancel, (event) => {
    owner(event);
    service.cancel();
  });
  ipcMain.handle(ipcChannels.extensionsEnable, (event, enabled) => {
    owner(event);
    return service.setEnabled(enabled);
  });
  ipcMain.handle(ipcChannels.extensionsUninstall, (event) => {
    owner(event);
    return service.uninstall();
  });
  ipcMain.handle(ipcChannels.traceOpen, (event, id, leaseId) => runtime.open(id, owner(event), leaseId));
  ipcMain.handle(ipcChannels.traceQuery, (event, id, query) => runtime.query(id, query, owner(event)));
  ipcMain.handle(ipcChannels.traceClose, (event, id) => runtime.close(id, owner(event)));
}
export async function shutdownExtensions() {
  await extension?.shutdown();
}
