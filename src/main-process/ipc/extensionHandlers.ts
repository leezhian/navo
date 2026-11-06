import { app, BrowserWindow, dialog, ipcMain, protocol } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { ipcChannels } from "../../shared/ipcChannels";
import { ExtensionRepository } from "../services/extensions/extensionRepository";
import { ExtensionService } from "../services/extensions/extensionService";
import { TraceRuntime } from "../services/extensions/traceRuntime";
import { SessionRepository } from "../services/taskSessions/sessionRepository";
import release from "../services/extensions/sessionTraceRelease.json";

let extension: ExtensionService | undefined;
export function registerExtensionScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: "navo-extension", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}
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
  ipcMain.handle(ipcChannels.traceOpen, (event, id) => runtime.open(id, owner(event)));
  ipcMain.handle(ipcChannels.traceQuery, (event, id, query) => runtime.query(id, query, owner(event)));
  ipcMain.handle(ipcChannels.traceClose, (event, id) => runtime.close(id, owner(event)));
  protocol.handle("navo-extension", async (request) => {
    try {
      if (!extension?.status.enabled || initializationError || request.method !== "GET") return new Response(null, { status: 403 });
      const url = new URL(request.url),
        name = decodeURIComponent(url.pathname).slice(1);
      if (url.hostname !== "session-trace" || !/^ui\/[a-zA-Z0-9_./-]+$/.test(name) || name.split("/").includes(".."))
        return new Response(null, { status: 404 });
      const root = await realpath(extension.installedDirectory),
        filename = await realpath(path.join(root, name));
      if (!filename.startsWith(root + path.sep)) return new Response(null, { status: 403 });
      const body = await readFile(filename);
      const mime = name.endsWith(".html")
        ? "text/html"
        : name.endsWith(".js")
          ? "text/javascript"
          : name.endsWith(".css")
            ? "text/css"
            : "application/octet-stream";
      return new Response(new Uint8Array(body), {
        headers: {
          "Content-Type": mime + "; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}
export async function shutdownExtensions() {
  await extension?.shutdown();
}
