import type { AppSettings } from "@/domain/types";

export const isDesktop = () => Boolean(window.navo?.settings);

function requireDesktop() {
  if (!isDesktop()) throw new Error("DESKTOP_REQUIRED");
  return window.navo;
}

export const settingsApi = {
  load: () => requireDesktop().settings.load(),
  save: (settings: AppSettings) => requireDesktop().settings.save(settings),
  chooseDirectory: () => requireDesktop().settings.chooseDirectory(),
  clearLogs: () => requireDesktop().settings.clearLogs(),
  chooseLogFile: () => requireDesktop().settings.chooseLogFile(),
  revealLogFile: () => requireDesktop().settings.revealLogFile(),
  getLogsStatus: () => requireDesktop().settings.getLogsStatus(),
};
