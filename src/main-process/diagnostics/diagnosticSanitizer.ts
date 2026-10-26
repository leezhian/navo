import { defaultSettings } from "../../domain/settings";
import type { DiagnosticEntry, DiagnosticEvent, DiagnosticMetadata } from "../../shared/diagnosticTypes";
import { isDiagnosticEvent } from "../../shared/diagnosticTypes";

const errorCodes = new Set([
  "EACCES", "EPERM", "ENOENT", "ENOSPC", "EROFS", "EIO", "EEXIST", "EISDIR", "EMFILE", "ETIMEDOUT", "ECONNRESET",
  "ERR_SQLITE_ERROR", "ERR_SQLITE_BUSY", "SQLITE_BUSY", "SQLITE_CORRUPT", "SQLITE_FULL", "SQLITE_READONLY",
  "INVALID_SETTINGS", "INVALID_LOG_FILE", "LOG_FILE_IN_USE", "INVALID_DIRECTORY", "INVALID_OPERATION",
  "INVALID_REPOSITORY_NAME", "INVALID_REPOSITORY_URL", "INVALID_RESOURCE", "INVALID_RESOURCE_STORAGE",
  "RESOURCE_NOT_FOUND", "DIRECTORY_EXISTS", "DUPLICATE_RESOURCE", "GIT_UNAVAILABLE",
  "CLONE_CANCELLED", "CLONE_FAILED", "CLONE_RECORD_FAILED", "WINDOW_UNAVAILABLE",
  "TASK_INVALID", "TASK_INVALID_TITLE", "TASK_NOT_FOUND", "TASK_NOTE_NOT_FOUND", "TASK_BUSY", "TASK_LEGACY_INVALID",
  "TASK_ATTACHMENT_MISSING", "TASK_FILES_ONLY", "TASK_RESOURCE_CHANGED", "TASK_CREATE_RETAINED",
  "TASK_BRANCH_EXISTS", "TASK_INVALID_BRANCH", "TASK_DIRTY_REPOSITORY", "TASK_EMPTY_REPOSITORY",
  "TASK_INVALID_SOURCE", "TASK_DUPLICATE_RESOURCE", "TASK_DELETE_CHANGED", "TASK_DELETE_CONFIRMATION",
  "TASK_DELETE_FAILED", "TASK_DELETE_INSPECTION",
  "SESSION_UNAVAILABLE", "SESSION_START_FAILED", "SESSION_EXIT_FAILED", "SESSION_DIRECTORY_MISSING", "SESSION_LIMIT",
  "SESSION_COMMAND_UNAVAILABLE", "SESSION_COMMAND_UNSUPPORTED",
  "SESSION_MODE_UNSUPPORTED", "SESSION_OPTION_UNSUPPORTED", "SESSION_RESUME_UNSUPPORTED", "SESSION_STORAGE_FAILED", "AGENT_UNAVAILABLE",
  "SESSION_INVALID_NAME", "SESSION_NATIVE_UNSUPPORTED", "SESSION_NATIVE_MISSING", "SESSION_NATIVE_CHANGED", "SESSION_NATIVE_DELETE_FAILED",
]);
const warningCodes = new Set([
  "TASK_DELETE_CHANGED", "TASK_DELETE_CONFIRMATION", "TASK_DELETE_INSPECTION", "TASK_CREATE_RETAINED",
  "TASK_RESOURCE_CHANGED", "TASK_DIRTY_REPOSITORY", "TASK_BRANCH_EXISTS", "TASK_ATTACHMENT_MISSING",
  "TASK_BUSY", "CLONE_CANCELLED", "DUPLICATE_RESOURCE", "DIRECTORY_EXISTS",
]);
const names = new Set(["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError", "AggregateError"]);
const reasons = new Set(["existing", "unowned", "shared", "changed", "main", "locked", "missing", "protected", "inUse", "inspectionFailed",
  "clean-exit", "abnormal-exit", "killed", "crashed", "oom", "launch-failed", "integrity-failure", "memory-eviction", "unknown"]);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const numericFields = ["windowId", "durationMs", "count", "resourceCount", "attachmentCount", "uncommittedFiles", "ignoredFiles", "fromVersion", "toVersion", "exitCode"] as const;

export function diagnosticErrorCode(error: unknown) {
  try {
    if (!error || typeof error !== "object") return "UNKNOWN";
    const value = error as { code?: unknown; message?: unknown };
    if (typeof value.code === "string" && errorCodes.has(value.code)) return value.code;
    if (typeof value.message === "string" && errorCodes.has(value.message)) return value.message;
    return typeof value.code === "number" ? "COMMAND_FAILED" : "UNKNOWN";
  } catch { return "UNKNOWN"; }
}

/** 丢弃错误首行、函数参数、源码路径和 URL，只保留有限的堆栈行列位置。 */
export function sanitizedStack(value: unknown): string[] | undefined {
  if (typeof value !== "string") return undefined;
  const frames = value.slice(0, 16000).split("\n").filter((line) => /^\s*at\s/.test(line)).slice(0, 12);
  return frames.map((line) => {
    const location = line.match(/:(\d{1,8}):(\d{1,8})\)?\s*$/);
    return location ? "at <redacted>:" + location[1] + ":" + location[2] : "at <redacted>";
  });
}

export function makeDiagnosticEntry(event: DiagnosticEvent, metadata: DiagnosticMetadata = {}, includeStack = true): DiagnosticEntry | null {
  try {
    if (!isDiagnosticEvent(event)) return null;
    const data: DiagnosticEntry["data"] = {};
    for (const field of ["operationId", "taskId", "resourceId"] as const) {
      const value = metadata[field];
      if (typeof value === "string" && uuid.test(value)) data[field] = value;
    }
    for (const field of numericFields) {
      const value = metadata[field];
      if (typeof value === "number" && Number.isFinite(value) && Number.isSafeInteger(Math.round(value))) data[field] = Math.round(value);
    }
    if (typeof metadata.version === "string" && /^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]{1,40})?$/i.test(metadata.version)) data.version = metadata.version;
    if (["darwin", "win32", "linux"].includes(metadata.platform ?? "")) data.platform = metadata.platform;
    if (["TODO", "DONE", "ARCHIVED"].includes(metadata.status ?? "")) data.status = metadata.status;
    if (reasons.has(metadata.reason ?? "")) data.reason = metadata.reason;
    if (Array.isArray(metadata.changedFields)) data.changedFields = [...new Set(metadata.changedFields.filter((key) => Object.prototype.hasOwnProperty.call(defaultSettings, key)))].slice(0, 32);
    const code = diagnosticErrorCode(metadata.error);
    const warning = warningCodes.has(code) || ["worktree.kept", "branch.kept", "task.cleanup_retained", "session.records_invalid", "renderer.unresponsive", "log.repeated", "log.dropped"].includes(event);
    const failure = metadata.error !== undefined || /(?:failed|uncaught|rejection|error|gone)$/.test(event);
    const entry: DiagnosticEntry = { schemaVersion: 1, time: new Date().toISOString(), level: warning ? "WARN" : failure ? "ERROR" : "INFO", scope: event.split(".")[0], event, data };
    if (metadata.error !== undefined) {
      const error = metadata.error && typeof metadata.error === "object" ? metadata.error as Error & { code?: unknown } : null;
      entry.error = {
        name: error && names.has(error.name) ? error.name : "Error", code,
        message: code === "UNKNOWN" ? "Unexpected application error; original message omitted for privacy." : code === "COMMAND_FAILED" ? "System command failed; arguments and output omitted." : "Operation reported " + code + ".",
      };
      if (error && includeStack) entry.error.stack = sanitizedStack(error.stack);
      if (error && typeof error.code === "number" && Number.isSafeInteger(error.code)) data.exitCode = error.code;
    }
    return entry;
  } catch { return null; }
}
