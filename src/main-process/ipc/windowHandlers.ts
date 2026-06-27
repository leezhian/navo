import { BrowserWindow, ipcMain } from "electron";
import { ipcChannels } from "../../shared/ipcChannels";

export function registerWindowHandlers() {
  ipcMain.handle(ipcChannels.windowGetIsFullScreen, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false;
  });
}

export function bindWindowStateEvents(window: BrowserWindow) {
  const sendFullScreenState = () => {
    window.webContents.send(ipcChannels.windowFullScreenChanged, window.isFullScreen());
  };

  window.on("enter-full-screen", sendFullScreenState);
  window.on("leave-full-screen", sendFullScreenState);
}
