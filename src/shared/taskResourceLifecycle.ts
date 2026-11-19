import type { Task } from "../domain/tasks";

export const TASK_FILE_DESCRIPTION_MAX_LENGTH = 2000;
export const TASK_FILE_PREVIEW_MAX_BYTES = 512 * 1024;
export const TASK_RESOURCE_UNDO_WINDOW_MS = 10_000;

export type TaskArchivableKind = "note" | "file" | "attachment" | "link";
export type TaskDetachableKind = "workspace" | "issue" | "link" | "file" | "attachment";
export type TaskManagedFileKind = "file" | "attachment";
export type TaskResourceSkipReason = "lastWorkspace" | "workspaceBusy" | "notAllowed" | "notFound" | "archivedTask" | "busy";
export type TaskFilePreviewType = "text" | "markdown" | "image" | "unsupported";
export type TaskFileRenameRefusal = "empty" | "separator" | "reserved" | "collision" | "missing" | "too-long";

export interface TaskResourceRef {
  kind: string;
  id: string;
}

export interface TaskResourceSkip extends TaskResourceRef {
  reason: TaskResourceSkipReason;
}

export interface TaskResourceBatchResult {
  task: Task;
  applied: TaskResourceRef[];
  skipped: TaskResourceSkip[];
  /** 可撤销时为到期时刻的 ISO 时间；没有可撤销项时为 null。 */
  undoExpiresAt: string | null;
}

export interface TaskResourceCleanupPlan {
  missingFiles: Array<{ kind: TaskManagedFileKind; id: string; name: string }>;
  /** 仅明确不存在的普通文件夹；工作树不参与引用清理。 */
  missingFolders: Array<{ id: string; name: string }>;
  mergedPullRequests: Array<{ id: string; title: string }>;
  closedIssues: Array<{ id: string; title: string }>;
}

export function emptyResourceCleanupPlan(): TaskResourceCleanupPlan {
  return { missingFiles: [], missingFolders: [], mergedPullRequests: [], closedIssues: [] };
}

export function hasResourceCleanup(plan: TaskResourceCleanupPlan | null): boolean {
  return Boolean(plan && (plan.missingFiles.length || plan.missingFolders.length || plan.mergedPullRequests.length || plan.closedIssues.length));
}

export interface TaskFileInspect {
  kind: TaskManagedFileKind;
  id: string;
  name: string;
  description: string;
  size: number;
  /** 文件存在时为 ISO 时间，缺失时为 null。 */
  mtime: string | null;
  exists: boolean;
  source: "path" | "attachment";
  /** 原路径引用的规范路径；附件只返回托管副本文件名，不返回应用数据目录。 */
  location: string;
  previewType: TaskFilePreviewType;
}

export interface TaskFilePreview {
  type: TaskFilePreviewType;
  text?: string;
  dataUrl?: string;
  truncated?: boolean;
  size: number;
}

const RENAME_CODES: Record<TaskFileRenameRefusal, string> = {
  empty: "TASK_FILE_RENAME_EMPTY",
  separator: "TASK_FILE_RENAME_SEPARATOR",
  reserved: "TASK_FILE_RENAME_RESERVED",
  collision: "TASK_FILE_RENAME_COLLISION",
  missing: "TASK_FILE_RENAME_MISSING",
  "too-long": "TASK_FILE_RENAME_TOO_LONG",
};

export class TaskFileRenameError extends Error {
  constructor(readonly reason: TaskFileRenameRefusal) { super(RENAME_CODES[reason]); }
}
