import { t } from "@/i18n";
import type { TranslationKey } from "@/i18n/types";
import { getSettingsError } from "./settingsErrors";

const messages: Record<string, TranslationKey<"tasks" | "taskCreate">> = {
  TASK_DELETE_CHANGED: "tasks:deletion.errors.changed",
  TASK_DELETE_CONFIRMATION: "tasks:deletion.errors.confirmation",
  TASK_DELETE_INSPECTION: "tasks:deletion.errors.inspection",
  TASK_DELETE_FAILED: "tasks:deletion.errors.failed",
  TASK_INVALID: "tasks:errors.invalid",
  TASK_INVALID_TITLE: "tasks:errors.invalidTitle",
  TASK_NOT_FOUND: "tasks:errors.notFound",
  TASK_INVALID_BRANCH: "taskCreate:errors.invalidBranch",
  TASK_BRANCH_EXISTS: "taskCreate:errors.branchExists",
  TASK_INVALID_SOURCE: "taskCreate:errors.invalidSource",
  TASK_EMPTY_REPOSITORY: "taskCreate:errors.emptyRepository",
  TASK_DIRTY_REPOSITORY: "taskCreate:errors.dirtyRepository",
  TASK_RESOURCE_CHANGED: "taskCreate:errors.resourceChanged",
  TASK_DUPLICATE_RESOURCE: "taskCreate:errors.duplicateResource",
  TASK_FILES_ONLY: "taskCreate:errors.filesOnly",
  TASK_ATTACHMENT_MISSING: "taskCreate:errors.attachmentMissing",
  TASK_CREATE_RETAINED: "taskCreate:errors.retained",
  TASK_BUSY: "tasks:errors.busy",
  TASK_LEGACY_INVALID: "tasks:errors.legacyInvalid",
};

export function getTaskError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = Object.keys(messages).find((key) => message.includes(key));
  return code ? t(messages[code]) : getSettingsError(error);
}
