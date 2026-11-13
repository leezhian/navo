import { t } from "@/i18n";
import type { TranslationKey } from "@/i18n/types";

const messages: Record<string, TranslationKey<"settings">> = {
  INVALID_RESOURCE_DESCRIPTION: "settings:errors.invalidResourceDescription",
  INVALID_RESOURCE_COMMAND: "settings:errors.invalidResourceCommand",
  INVALID_LOG_FILE: "settings:errors.invalidLogFile",
  LOG_FILE_IN_USE: "settings:errors.logFileInUse",
  DESKTOP_REQUIRED: "settings:errors.desktopRequired",
  INVALID_DIRECTORY: "settings:errors.invalidDirectory",
  DUPLICATE_RESOURCE: "settings:errors.duplicateResource",
  DIRECTORY_EXISTS: "settings:errors.directoryExists",
  INVALID_REPOSITORY_URL: "settings:errors.invalidRepositoryUrl",
  INVALID_REPOSITORY_NAME: "settings:errors.invalidRepositoryName",
  INVALID_RESOURCE: "settings:errors.invalidResource",
  RESOURCE_NOT_FOUND: "settings:errors.invalidResource",
  CLONE_FAILED: "settings:errors.cloneFailed",
  GIT_UNAVAILABLE: "settings:errors.gitUnavailable",
  CLONE_CANCELLED: "settings:errors.cloneCancelled",
  CLONE_RECORD_FAILED: "settings:errors.cloneRecordFailed",
  INVALID_RESOURCE_STORAGE: "settings:errors.invalidStorage",
  INVALID_SETTINGS: "settings:errors.invalidStorage",
  EACCES: "settings:errors.directoryPermission",
  EPERM: "settings:errors.directoryPermission",
  ENOENT: "settings:errors.invalidDirectory",
};

export function getSettingsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = Object.keys(messages).find((key) => message.includes(key));
  return t(code ? messages[code] : "common:errors.operationFailed");
}
