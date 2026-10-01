import type { BrowserWindow } from "electron";

export function bindDevelopmentTools(window: BrowserWindow, enabled: boolean) {
  if (!enabled) return;

  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.isAutoRepeat) return;

    const isInspectShortcut = input.code === "KeyI" && (process.platform === "darwin"
      ? input.meta && input.alt && !input.control && !input.shift
      : input.control && input.shift && !input.meta && !input.alt);

    if (input.key === "F12" || isInspectShortcut) {
      event.preventDefault();
      window.webContents.toggleDevTools();
    }
  });
}
