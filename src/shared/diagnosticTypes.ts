export const DIAGNOSTIC_OPERATIONS = [
  "settings.load", "settings.save", "settings.migrate", "database.migrate", "database.open", "worktree.inspect",
  "resource.list", "resource.add", "resource.edit", "resource.remove", "resource.clone",
  "task.load", "task.migrate", "task.create", "task.rename", "task.move", "task.restore", "task.delete", "task.resources.add",
  "worktree.create", "worktree.rollback", "worktree.delete", "branch.create", "branch.delete",
  "attachment.select", "attachment.copy", "attachment.clear",
  "session.start", "session.stop",
] as const;
export type DiagnosticOperation = typeof DIAGNOSTIC_OPERATIONS[number];
export const DIAGNOSTIC_RESULTS = ["started", "succeeded", "failed", "cancelled"] as const;
export const DIAGNOSTIC_STANDALONE_EVENTS = [
  "app.started", "app.stopped", "app.uncaught", "app.unhandled_rejection", "app.watcher_failed",
  "database.open_failed", "database.transaction_failed", "worktree.kept", "branch.kept", "task.cleanup_retained",
  "renderer.error", "renderer.unhandled_rejection", "renderer.react_error", "renderer.gone",
  "renderer.unresponsive", "renderer.responsive", "log.repeated", "log.dropped",
] as const;
export type DiagnosticEvent = `${DiagnosticOperation}.${typeof DIAGNOSTIC_RESULTS[number]}`
  | typeof DIAGNOSTIC_STANDALONE_EVENTS[number];
export type DiagnosticLevel = "INFO" | "WARN" | "ERROR";

export const MAX_DIAGNOSTIC_ENTRY_BYTES = 8192;
export const MAX_DIAGNOSTIC_LOG_BYTES = 20 * 1024 * 1024;
export const MAX_REPORTED_STACK_LENGTH = 16000;

export interface DiagnosticMetadata {
  operationId?: string;
  taskId?: string;
  resourceId?: string;
  windowId?: number;
  durationMs?: number;
  count?: number;
  resourceCount?: number;
  attachmentCount?: number;
  uncommittedFiles?: number;
  ignoredFiles?: number;
  fromVersion?: number;
  toVersion?: number;
  exitCode?: number;
  version?: string;
  platform?: string;
  status?: string;
  reason?: string;
  changedFields?: string[];
  /** 只交给白名单序列化器，不直接写入异常对象或原始 message。 */
  error?: unknown;
}

export interface DiagnosticEntry {
  schemaVersion: 1;
  time: string;
  level: DiagnosticLevel;
  scope: string;
  event: DiagnosticEvent;
  data: Omit<DiagnosticMetadata, "error">;
  error?: { name: string; code: string; message: string; stack?: string[] };
}

export interface RendererDiagnosticReport {
  /** 仅允许异常类别，不开放任意日志级别、事件名或文件写入。 */
  kind: "error" | "unhandled-rejection" | "react-error";
  name: string;
  stack?: string;
}

const standaloneEvents = new Set<string>(DIAGNOSTIC_STANDALONE_EVENTS);
export function isDiagnosticEvent(value: unknown): value is DiagnosticEvent {
  return typeof value === "string" && (standaloneEvents.has(value)
    || DIAGNOSTIC_OPERATIONS.some((operation) => DIAGNOSTIC_RESULTS.some((result) => value === operation + "." + result)));
}
