import { app, ipcMain, shell } from "electron";
import type { ExternalLinkTarget } from "../../shared/electronApi";
import { ipcChannels } from "../../shared/ipcChannels";

const EXTERNAL_LINKS: Record<ExternalLinkTarget, string> = {
  website: "https://github.com/leezhian/vibe-reviewer",
  "report-bug": "https://github.com/leezhian/vibe-reviewer/issues",
};

export function registerAppHandlers() {
  ipcMain.handle(ipcChannels.appGetInfo, () => ({
    name: app.getName(),
    version: app.getVersion(),
  }));

  ipcMain.handle(ipcChannels.appOpenExternalLink, async (_event, target: ExternalLinkTarget) => {
    const url = EXTERNAL_LINKS[target];
    if (!url) {
      throw new Error("未知的外部链接目标");
    }

    await shell.openExternal(url);
  });

  ipcMain.handle(ipcChannels.appCheckForUpdates, () => ({
    hasUpdate: false,
    message: "UPDATES_UNAVAILABLE",
  }));
}
