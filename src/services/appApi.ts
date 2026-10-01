import type { AppInfo, CheckForUpdatesResult, ExternalLinkTarget } from "@/shared/electronApi";

const fallbackAppInfo: AppInfo = {
  name: "Navo",
  version: "1.0.0",
};

export async function loadAppInfo(): Promise<AppInfo> {
  try {
    return await window.navo.app.getInfo();
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return fallbackAppInfo;
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export async function openAppExternalLink(target: ExternalLinkTarget): Promise<void> {
  try {
    await window.navo.app.openExternalLink(target);
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return;
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export async function checkForAppUpdates(): Promise<CheckForUpdatesResult> {
  try {
    return await window.navo.app.checkForUpdates();
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return {
        hasUpdate: false,
        message: "浏览器预览模式暂不支持检查更新。",
      };
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

function isElectronApiUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("navo") || message.includes("is not a function");
}
