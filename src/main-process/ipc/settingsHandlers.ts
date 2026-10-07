import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import { ipcChannels } from "../../shared/ipcChannels";
import type { CloneResourceParams, SaveResourceParams } from "../../shared/settingsTypes";
import { loadSettings, saveSettings } from "../services/settingsService";
import { ResourceService } from "../services/resourceService";
import { inspectResourceGit } from "../services/resourceGitInfo";
import { clearDiagnosticLog, getDiagnosticLogFilePath, getDiagnosticLogStatus, prepareDiagnosticLogFile } from "../services/diagnosticLogService";
import { validateDiagnosticLogPath } from "../services/diagnosticLogPath";
import { updateApplicationMenu } from "../applicationMenu";

let resources: ResourceService | null = null;

export async function stopResourceOperations() { await resources?.cancelAll(); }

export function registerSettingsHandlers() {
  const service = new ResourceService(path.join(app.getPath("userData"), "resources.json"));
  const boundOwners = new Set<number>();
  resources = service;
  ipcMain.handle(ipcChannels.settingsLoad, async () => ({ ...await loadSettings(), logFilePath: getDiagnosticLogFilePath() }));
  ipcMain.handle(ipcChannels.settingsLogsStatus, () => getDiagnosticLogStatus());
  ipcMain.handle(ipcChannels.settingsSave, async (_event, value: unknown) => {
    const settings = await saveSettings(value);
    updateApplicationMenu(settings.locale);
    return settings;
  });
  ipcMain.handle(ipcChannels.settingsChooseDirectory, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("WINDOW_UNAVAILABLE");
    const result = await dialog.showOpenDialog(window, {
      defaultPath: app.getPath("home"),
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle(ipcChannels.settingsClearLogs, () => clearDiagnosticLog());
  ipcMain.handle(ipcChannels.settingsChooseLogFile, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("WINDOW_UNAVAILABLE");
    const currentPath = getDiagnosticLogFilePath();
    const result = await dialog.showOpenDialog(window, {
      defaultPath: path.dirname(currentPath),
      properties: ["openDirectory", "createDirectory"],
    });
    const directory = result.filePaths?.[0];
    return result.canceled || !directory ? null : validateDiagnosticLogPath(path.join(directory, path.basename(currentPath)));
  });
  ipcMain.handle(ipcChannels.settingsRevealLogFile, async () => {
    shell.showItemInFolder(await prepareDiagnosticLogFile());
  });
  ipcMain.handle(ipcChannels.resourcesList, () => service.list());
  ipcMain.handle(ipcChannels.resourcesInspectGit, (event, localPath: string, forceRefresh?: boolean) => {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) throw new Error("WINDOW_UNAVAILABLE");
    return inspectResourceGit(localPath, forceRefresh === true);
  });
  ipcMain.handle(ipcChannels.resourcesSave, async (_event, params: SaveResourceParams) => {
    const record = await service.save(params);
    return record;
  });
  ipcMain.handle(ipcChannels.resourcesRemove, async (_event, id: string) => {
    await service.remove(id);
  });
  ipcMain.handle(ipcChannels.resourcesClone, async (event, params: CloneResourceParams) => {
    const ownerId = event.sender.id;
    if (!boundOwners.has(ownerId)) {
      boundOwners.add(ownerId);
      event.sender.once("destroyed", () => { void service.cancelAll(ownerId); boundOwners.delete(ownerId); });
    }
    return service.clone(params, ownerId, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send(ipcChannels.resourcesCloneProgress, progress);
    });
  });
  ipcMain.handle(ipcChannels.resourcesCancelClone, (event, operationId: string) => service.cancel(operationId, event.sender.id));
}
