import { app, BrowserWindow, safeStorage, shell } from "electron";
import path from "node:path";
import { ipcChannels } from "../../../shared/ipcChannels";
import { IntegrationService } from "./integrationService";
import { createSafeStorageCipher } from "./tokenCipher";

let service: IntegrationService | null = null;

function broadcast(channel: string) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel);
  }
}

export function getIntegrationService() {
  if (!service) {
    service = new IntegrationService({
      filename: path.join(app.getPath("userData"), "app.db"),
      cipher: createSafeStorageCipher(safeStorage),
      fetch,
      openExternal: (url) => shell.openExternal(url),
      onChanged: () => broadcast(ipcChannels.integrationsChanged),
      onIssuesChanged: () => broadcast(ipcChannels.issuesChanged),
    });
  }
  return service;
}
