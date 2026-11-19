import { existsSync, renameSync, statSync } from "node:fs";
import { open, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Task } from "../../domain/tasks";
import { TASK_PROMPT_ID } from "../../shared/taskContextTypes";
import type { TaskResource } from "../../shared/taskTypes";
import type { IssueItem } from "../../domain/issues";
import {
  TASK_FILE_DESCRIPTION_MAX_LENGTH,
  TASK_FILE_PREVIEW_MAX_BYTES,
  TASK_RESOURCE_UNDO_WINDOW_MS,
  TaskFileRenameError,
  type TaskArchivableKind,
  type TaskDetachableKind,
  type TaskFileInspect,
  type TaskFilePreview,
  type TaskManagedFileKind,
  type TaskResourceBatchResult,
  type TaskResourceCleanupPlan,
  type TaskResourceRef,
  type TaskResourceSkip,
  type TaskResourceSkipReason,
} from "../../shared/taskResourceLifecycle";
import { classifyTaskFilePreview } from "../../utils/taskFilePreview";
import { proposedManagedFileName } from "../../utils/taskManagedFileName";
import { canonicalTaskLinkUrl, TASK_LINK_TITLE_MAX_LENGTH } from "../../utils/taskWebLinks";
import { openAppDatabase } from "./appDatabase";
import { TaskRepository } from "./taskRepository";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TASK_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const ARCHIVABLE = new Set<TaskArchivableKind>(["note", "file", "attachment", "link"]);
const RESTORABLE = new Set<string>(["note", "file", "attachment", "link", "issue"]);
const DETACHABLE = new Set<TaskDetachableKind>(["workspace", "issue", "link", "file", "attachment"]);
const IMAGE_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;
const FILE_SAMPLE_BYTES = 8192;

interface UndoItem {
  kind: string;
  id: string;
  action: "detach" | "archive" | "restore-row";
  payload: unknown;
  attachmentPending?: { directory: string; storageName: string };
}

interface UndoRecord {
  taskId: string;
  ownerId: number;
  expiresAt: number;
  items: UndoItem[];
  timer: ReturnType<typeof setTimeout>;
}

function requireId(value: string, pattern = UUID) {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error("TASK_INVALID");
  return value;
}

function requireTaskRow(database: DatabaseSync, namespace: string, taskId: string) {
  const task = database.prepare("SELECT status FROM tasks WHERE namespace=? AND id=?").get(namespace, taskId);
  if (!task) throw new Error("TASK_NOT_FOUND");
  return task as { status: string };
}

function touch(database: DatabaseSync, namespace: string, taskId: string) {
  database.prepare("UPDATE tasks SET updated_at=?,context_version=context_version+1 WHERE namespace=? AND id=?")
    .run(new Date().toISOString(), namespace, taskId);
}

function fileColumns(row: Record<string, unknown>) {
  return {
    id: String(row.id), name: String(row.name), path: String(row.path), size: Number(row.size),
    description: String(row.description ?? ""), ...(row.archived_at ? { archivedAt: String(row.archived_at) } : {}),
  };
}

function attachmentColumns(row: Record<string, unknown>) {
  return {
    id: String(row.id), name: String(row.name), size: Number(row.size), storageName: String(row.storage_name),
    description: String(row.description ?? ""), ...(row.archived_at ? { archivedAt: String(row.archived_at) } : {}),
  };
}

function linkColumns(row: Record<string, unknown>) {
  return {
    id: String(row.id), url: String(row.url), title: String(row.title), position: Number(row.position),
    ...(row.archived_at ? { archivedAt: String(row.archived_at) } : {}),
  };
}

/** 资源归档、批量解除、清理、附件删除与短撤销；不向渲染进程暴露任意磁盘路径参数。 */
export class TaskResourceLifecycleService {
  private readonly undos = new Map<string, UndoRecord>();

  constructor(
    private readonly tasks: TaskRepository,
    private readonly filename: string,
    private readonly namespace: string,
    private readonly userData: string,
    private readonly isWorkspaceBusy?: (taskId: string, resourceId: string) => boolean,
  ) {}

  private attachmentDirectory(taskId: string) {
    requireId(taskId, TASK_ID);
    return path.join(this.userData, "task-files", this.namespace, taskId);
  }

  private undoKey(taskId: string, ownerId: number) {
    return `${taskId}:${ownerId}`;
  }

  private async loaded(taskId: string) {
    const task = (await this.tasks.load())?.find((item) => item.id === taskId);
    if (!task) throw new Error("TASK_NOT_FOUND");
    return task;
  }

  private async mutate<Result>(taskId: string, operation: (database: DatabaseSync) => Result) {
    requireId(taskId, TASK_ID);
    const database = await openAppDatabase(this.filename);
    let open = false;
    try {
      database.exec("BEGIN IMMEDIATE"); open = true;
      const task = requireTaskRow(database, this.namespace, taskId);
      if (task.status === "ARCHIVED") throw new Error("TASK_BUSY");
      if (database.prepare("SELECT 1 FROM task_deletions WHERE namespace=? AND task_id=?").get(this.namespace, taskId)) throw new Error("TASK_BUSY");
      const result = operation(database);
      database.exec("COMMIT"); open = false;
      return result;
    } catch (error) { if (open) database.exec("ROLLBACK"); throw error; }
    finally { database.close(); }
  }

  forgetOwner(ownerId: number) {
    for (const [key, record] of this.undos) if (record.ownerId === ownerId) {
      this.undos.delete(key);
      clearTimeout(record.timer);
      void this.finalizeAttachments(record.items);
    }
  }

  invalidateTask(taskId: string) {
    for (const [key, record] of this.undos) if (record.taskId === taskId) {
      this.undos.delete(key);
      clearTimeout(record.timer);
      void this.finalizeAttachments(record.items);
    }
  }

  private armUndo(taskId: string, ownerId: number, items: UndoItem[]): string | null {
    this.invalidateTask(taskId);
    if (!items.length) return null;
    const expiresAt = Date.now() + TASK_RESOURCE_UNDO_WINDOW_MS;
    const key = this.undoKey(taskId, ownerId);
    const record: UndoRecord = {
      taskId, ownerId, expiresAt, items,
      timer: setTimeout(() => {
        const current = this.undos.get(key);
        if (current === record) {
          this.undos.delete(key);
          void this.finalizeAttachments(items);
        }
      }, TASK_RESOURCE_UNDO_WINDOW_MS),
    };
    this.undos.set(key, record);
    return new Date(expiresAt).toISOString();
  }

  private async finalizeAttachments(items: UndoItem[]) {
    for (const item of items) {
      const pending = item.attachmentPending;
      if (!pending) continue;
      try {
        const database = await openAppDatabase(this.filename);
        try {
          const row = database.prepare("SELECT 1 FROM task_attachments WHERE namespace=? AND id=?").get(this.namespace, item.id);
          if (row) continue;
        } finally { database.close(); }
        const target = path.join(pending.directory, pending.storageName);
        if (path.basename(pending.storageName) !== pending.storageName) continue;
        await rm(target, { force: true });
      } catch { /* 任务删除可能已清掉目录。 */ }
    }
  }

  private result(task: Task, applied: TaskResourceRef[], skipped: TaskResourceSkip[], undoExpiresAt: string | null): TaskResourceBatchResult {
    return { task, applied, skipped, undoExpiresAt };
  }

  async archiveResources(taskId: string, items: TaskResourceRef[], ownerId: number) {
    const { applied, skipped, undo } = await this.mutate(taskId, (database) => this.archiveOrRestore(database, taskId, items, "archive"));
    const undoExpiresAt = this.armUndo(taskId, ownerId, undo);
    return this.result(await this.loaded(taskId), applied, skipped, undoExpiresAt);
  }

  async restoreResources(taskId: string, items: TaskResourceRef[], ownerId: number) {
    const { applied, skipped, undo } = await this.mutate(taskId, (database) => this.archiveOrRestore(database, taskId, items, "restore"));
    const undoExpiresAt = this.armUndo(taskId, ownerId, undo);
    return this.result(await this.loaded(taskId), applied, skipped, undoExpiresAt);
  }

  private archiveOrRestore(database: DatabaseSync, taskId: string, items: TaskResourceRef[], mode: "archive" | "restore") {
    const applied: TaskResourceRef[] = [];
    const skipped: TaskResourceSkip[] = [];
    const undo: UndoItem[] = [];
    const now = new Date().toISOString();
    let changed = false;
    const seen = new Set<string>();
    for (const item of this.expandLinks(database, taskId, this.normalized(items))) {
      const key = item.kind + ":" + item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const allowed = mode === "restore" ? RESTORABLE : ARCHIVABLE;
      if (!allowed.has(item.kind)) { skipped.push({ ...item, reason: "notAllowed" }); continue; }
      const snapshot = this.readManaged(database, taskId, item);
      if (!snapshot) { skipped.push({ ...item, reason: "notFound" }); continue; }
      if (mode === "archive" && snapshot.archivedAt) { skipped.push({ ...item, reason: "notFound" }); continue; }
      if (mode === "restore" && !snapshot.archivedAt) { skipped.push({ ...item, reason: "notFound" }); continue; }
      this.setArchivedAt(database, taskId, item, mode === "archive" ? now : null);
      applied.push(item);
      undo.push({ kind: item.kind, id: item.id, action: "archive", payload: { archivedAt: snapshot.archivedAt ?? null } });
      changed = true;
    }
    if (changed) touch(database, this.namespace, taskId);
    return { applied, skipped, undo };
  }

  async detachResources(taskId: string, items: TaskResourceRef[], ownerId: number) {
    const { applied, skipped, undo } = await this.mutate(taskId, (database) => this.detachMany(database, taskId, items));
    const undoExpiresAt = this.armUndo(taskId, ownerId, undo);
    return this.result(await this.loaded(taskId), applied, skipped, undoExpiresAt);
  }

  async deleteAttachments(taskId: string, ids: string[], ownerId: number) {
    const items = ids.map((id) => ({ kind: "attachment" as const, id }));
    const { applied, skipped, undo } = await this.mutate(taskId, (database) => this.detachMany(database, taskId, items, true));
    const undoExpiresAt = this.armUndo(taskId, ownerId, undo);
    return this.result(await this.loaded(taskId), applied, skipped, undoExpiresAt);
  }

  private detachMany(database: DatabaseSync, taskId: string, items: TaskResourceRef[], deleteCopies = false, shouldTouch = true) {
    const applied: TaskResourceRef[] = [];
    const skipped: TaskResourceSkip[] = [];
    const undo: UndoItem[] = [];
    let changed = false;
    const expanded = this.expandLinks(database, taskId, this.normalized(items));
    for (const item of expanded) {
      if (!DETACHABLE.has(item.kind as TaskDetachableKind)) { skipped.push({ ...item, reason: "notAllowed" }); continue; }
      if (item.kind === "workspace") {
        const reason = this.workspaceDetachReason(database, taskId, item.id);
        if (reason) { skipped.push({ ...item, reason }); continue; }
      }
      const snapshot = this.readDetachable(database, taskId, item);
      if (!snapshot) { skipped.push({ ...item, reason: "notFound" }); continue; }
      this.deleteManaged(database, taskId, item, snapshot);
      const pending = item.kind === "attachment" && deleteCopies ? {
        directory: this.attachmentDirectory(taskId),
        storageName: String((snapshot as { storageName: string }).storageName),
      } : undefined;
      applied.push(item);
      undo.push({ kind: item.kind, id: item.id, action: "detach", payload: snapshot, attachmentPending: pending });
      changed = true;
    }
    if (changed && shouldTouch) touch(database, this.namespace, taskId);
    return { applied, skipped, undo, changed };
  }

  inspectCleanup(taskId: string) {
    requireId(taskId, TASK_ID);
    return this.withDatabase(async (database) => {
      requireTaskRow(database, this.namespace, taskId);
      return this.cleanupPlan(database, taskId);
    });
  }

  async applyCleanup(taskId: string, ownerId: number) {
    const { applied, skipped, undo } = await this.mutate(taskId, (database) => {
      const plan = this.cleanupPlan(database, taskId);
      const missing: TaskResourceRef[] = [...plan.missingFiles.map((item) => ({ kind: item.kind, id: item.id })),
        ...plan.missingFolders.map((item) => ({ kind: "workspace", id: item.id }))];
      const completedLinks = [...plan.mergedPullRequests, ...plan.closedIssues].map((item) => ({ kind: "issue" as const, id: item.id }));
      const detached = this.detachMany(database, taskId, missing, false, false);
      const now = new Date().toISOString();
      const undo: UndoItem[] = [...detached.undo];
      const applied: TaskResourceRef[] = [...detached.applied];
      const skipped: TaskResourceSkip[] = [...detached.skipped];
      let changed = detached.changed;
      for (const item of completedLinks) {
        const row = database.prepare("SELECT data FROM task_links WHERE namespace=? AND task_id=? AND link_id=?").get(this.namespace, taskId, item.id);
        if (!row) { skipped.push({ ...item, reason: "notFound" }); continue; }
        const link = JSON.parse(String(row.data)) as IssueItem & { archivedAt?: string };
        if (link.archivedAt) { skipped.push({ ...item, reason: "notFound" }); continue; }
        if (!((link.group === "PR" && link.status === "merged") || (link.group === "ISSUE" && link.status === "closed"))) { skipped.push({ ...item, reason: "notAllowed" }); continue; }
        database.prepare("UPDATE task_links SET data=? WHERE namespace=? AND task_id=? AND link_id=?")
          .run(JSON.stringify({ ...link, archivedAt: now }), this.namespace, taskId, item.id);
        applied.push(item);
        undo.push({ kind: "issue", id: item.id, action: "archive", payload: { archivedAt: null } });
        changed = true;
      }
      if (changed) touch(database, this.namespace, taskId);
      return { applied, skipped, undo };
    });
    const undoExpiresAt = this.armUndo(taskId, ownerId, undo);
    return this.result(await this.loaded(taskId), applied, skipped, undoExpiresAt);
  }

  private cleanupPlan(database: DatabaseSync, taskId: string): TaskResourceCleanupPlan {
    const missingFiles: TaskResourceCleanupPlan["missingFiles"] = [];
    for (const row of database.prepare("SELECT id,name,path,archived_at FROM task_file_references WHERE namespace=? AND task_id=?").all(this.namespace, taskId)) {
      if (row.archived_at) continue;
      if (!this.pathExists(String(row.path))) missingFiles.push({ kind: "file", id: String(row.id), name: String(row.name) });
    }
    for (const row of database.prepare("SELECT id,name,storage_name,archived_at FROM task_attachments WHERE namespace=? AND task_id=?").all(this.namespace, taskId)) {
      if (row.archived_at) continue;
      const storageName = String(row.storage_name);
      if (path.basename(storageName) !== storageName) continue;
      if (!this.pathExists(path.join(this.attachmentDirectory(taskId), storageName))) {
        missingFiles.push({ kind: "attachment", id: String(row.id), name: String(row.name) });
      }
    }
    const mergedPullRequests: TaskResourceCleanupPlan["mergedPullRequests"] = [];
    const closedIssues: TaskResourceCleanupPlan["closedIssues"] = [];
    for (const row of database.prepare("SELECT link_id,data FROM task_links WHERE namespace=? AND task_id=?").all(this.namespace, taskId)) {
      const link = JSON.parse(String(row.data)) as IssueItem & { archivedAt?: string };
      if (link.archivedAt) continue;
      if (link.group === "PR" && link.status === "merged") mergedPullRequests.push({ id: String(row.link_id), title: link.title });
      if (link.group === "ISSUE" && link.status === "closed") closedIssues.push({ id: String(row.link_id), title: link.title });
    }
    const missingFolders = this.workspaceRows(database, taskId).flatMap(({ resource }) => {
      if (resource.mode !== "folder" || this.workspaceDetachReason(database, taskId, resource.resourceId)) return [];
      try { statSync(resource.workingPath); return []; }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        return code === "ENOENT" || code === "ENOTDIR" ? [{ id: resource.resourceId, name: resource.name }] : [];
      }
    });
    return { missingFiles, missingFolders, mergedPullRequests, closedIssues };
  }

  private pathExists(target: string) {
    try { return statSync(target).isFile(); }
    catch { return false; }
  }

  async undo(taskId: string, ownerId: number) {
    requireId(taskId, TASK_ID);
    const record = this.undos.get(this.undoKey(taskId, ownerId));
    if (!record) throw new Error("TASK_UNDO_EXPIRED");
    this.undos.delete(this.undoKey(taskId, ownerId));
    clearTimeout(record.timer);
    try {
      await this.mutate(taskId, (database) => {
        // 撤销前若任务又被改过，批次快照可能已经过期。
        for (const item of [...record.items].reverse()) this.applyUndo(database, taskId, item);
        touch(database, this.namespace, taskId);
      });
    } catch (error) {
      void this.finalizeAttachments(record.items);
      throw error;
    }
    return this.loaded(taskId);
  }

  private applyUndo(database: DatabaseSync, taskId: string, item: UndoItem) {
    if (item.action === "archive") {
      const previous = (item.payload as { archivedAt: string | null }).archivedAt;
      if (item.kind === "issue") {
        const row = database.prepare("SELECT data FROM task_links WHERE namespace=? AND task_id=? AND link_id=?").get(this.namespace, taskId, item.id);
        if (!row) throw new Error("TASK_RESOURCE_CHANGED");
        const link = JSON.parse(String(row.data)) as IssueItem & { archivedAt?: string };
        const next = { ...link };
        if (previous) next.archivedAt = previous; else delete next.archivedAt;
        database.prepare("UPDATE task_links SET data=? WHERE namespace=? AND task_id=? AND link_id=?")
          .run(JSON.stringify(next), this.namespace, taskId, item.id);
        return;
      }
      this.setArchivedAt(database, taskId, { kind: item.kind, id: item.id }, previous);
      return;
    }
    if (item.kind === "workspace") {
      const snapshot = item.payload as { resource: TaskResource; position: number; managed?: { path: string; branch: string; repository: string }; steps: Array<{ id: string; data: string }>; projectName: string };
      if (database.prepare("SELECT 1 FROM task_resources WHERE namespace=? AND task_id=? AND position=?").get(this.namespace, taskId, snapshot.position)
        || this.workspaceRows(database, taskId).some((row) => row.resource.resourceId === snapshot.resource.resourceId)) {
        throw new Error("TASK_RESOURCE_CHANGED");
      }
      database.prepare("INSERT INTO task_resources VALUES (?,?,?,?)").run(this.namespace, taskId, snapshot.position, JSON.stringify(snapshot.resource));
      if (snapshot.managed) database.prepare("INSERT OR IGNORE INTO managed_workspaces VALUES (?,?,?,?,?)")
        .run(this.namespace, taskId, snapshot.managed.path, snapshot.managed.branch, snapshot.managed.repository);
      for (const step of snapshot.steps) database.prepare("INSERT OR IGNORE INTO task_initialization VALUES (?,?,?,?)")
        .run(this.namespace, taskId, step.id, step.data);
      database.prepare("UPDATE tasks SET project_name=? WHERE namespace=? AND id=?").run(snapshot.projectName, this.namespace, taskId);
      return;
    }
    if (item.kind === "issue") {
      const data = item.payload as { data: string };
      if (database.prepare("SELECT 1 FROM task_links WHERE namespace=? AND task_id=? AND link_id=?").get(this.namespace, taskId, item.id)) throw new Error("TASK_RESOURCE_CHANGED");
      database.prepare("INSERT INTO task_links VALUES (?,?,?,?)").run(this.namespace, taskId, item.id, data.data);
      return;
    }
    if (item.kind === "link") {
      const link = item.payload as ReturnType<typeof linkColumns>;
      if (database.prepare("SELECT 1 FROM task_web_links WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, link.id)) throw new Error("TASK_RESOURCE_CHANGED");
      database.prepare("INSERT INTO task_web_links (namespace,task_id,id,position,url,title,archived_at) VALUES (?,?,?,?,?,?,?)")
        .run(this.namespace, taskId, link.id, link.position, link.url, link.title, link.archivedAt ?? null);
      return;
    }
    if (item.kind === "file") {
      const file = item.payload as ReturnType<typeof fileColumns>;
      if (database.prepare("SELECT 1 FROM task_file_references WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, file.id)) throw new Error("TASK_RESOURCE_CHANGED");
      database.prepare("INSERT INTO task_file_references (namespace,task_id,id,name,path,size,archived_at,description) VALUES (?,?,?,?,?,?,?,?)")
        .run(this.namespace, taskId, file.id, file.name, file.path, file.size, file.archivedAt ?? null, file.description ?? "");
      return;
    }
    if (item.kind === "attachment") {
      const file = item.payload as ReturnType<typeof attachmentColumns>;
      const pending = item.attachmentPending;
      if (pending) {
        const target = path.join(pending.directory, pending.storageName);
        try {
          if (path.basename(pending.storageName) !== pending.storageName) throw new Error("TASK_UNDO_EXPIRED");
          statSync(target);
        } catch { throw new Error("TASK_UNDO_EXPIRED"); }
      }
      if (database.prepare("SELECT 1 FROM task_attachments WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, file.id)) throw new Error("TASK_RESOURCE_CHANGED");
      database.prepare("INSERT INTO task_attachments (namespace,task_id,id,name,size,storage_name,archived_at,description) VALUES (?,?,?,?,?,?,?,?)")
        .run(this.namespace, taskId, file.id, file.name, file.size, file.storageName, file.archivedAt ?? null, file.description ?? "");
    }
  }

  private async readPrefix(target: string, length: number) {
    const handle = await open(target, "r");
    try {
      const buffer = Buffer.alloc(Math.max(0, length));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      return buffer.subarray(0, bytesRead);
    } finally { await handle.close(); }
  }

  async inspectFile(taskId: string, kind: TaskManagedFileKind, id: string): Promise<TaskFileInspect> {
    requireId(taskId, TASK_ID);
    if (typeof id !== "string" || id.includes("/") || id.includes("\\") || !UUID.test(id)) throw new Error("TASK_INVALID");
    const resolved = await this.resolveFile(taskId, kind, id);
    let exists = false, size = resolved.size, mtime: string | null = null, sample: Buffer | null = null;
    try {
      const details = await stat(resolved.fsPath);
      exists = details.isFile();
      if (exists) {
        size = details.size;
        mtime = details.mtime.toISOString();
        sample = await this.readPrefix(resolved.fsPath, FILE_SAMPLE_BYTES);
      }
    } catch { exists = false; }
    return {
      kind, id, name: resolved.name, description: resolved.description, size, mtime, exists,
      source: kind === "file" ? "path" : "attachment",
      location: kind === "file" ? resolved.displayPath : resolved.storageName,
      previewType: classifyTaskFilePreview(resolved.name, sample),
    };
  }

  async previewFile(taskId: string, kind: TaskManagedFileKind, id: string): Promise<TaskFilePreview> {
    const inspected = await this.inspectFile(taskId, kind, id);
    const resolved = await this.resolveFile(taskId, kind, id);
    if (inspected.previewType === "unsupported" || !inspected.exists) return { type: "unsupported", size: inspected.size };
    if (inspected.previewType === "image") {
      if (inspected.size > IMAGE_PREVIEW_MAX_BYTES) return { type: "unsupported", size: inspected.size };
      const bytes = await readFile(resolved.fsPath);
      const extension = path.extname(resolved.name).toLowerCase().replace(".", "") || "png";
      const mime = extension === "jpg" ? "jpeg" : extension;
      return { type: "image", dataUrl: `data:image/${mime};base64,${bytes.toString("base64")}`, size: inspected.size };
    }
    const bytes = await this.readPrefix(resolved.fsPath, TASK_FILE_PREVIEW_MAX_BYTES);
    return { type: inspected.previewType, text: bytes.toString("utf8"), truncated: inspected.size > TASK_FILE_PREVIEW_MAX_BYTES, size: inspected.size };
  }

  async updateFileMeta(taskId: string, kind: TaskManagedFileKind, id: string, patch: { name?: string; description?: string }) {
    requireId(taskId, TASK_ID);
    if (typeof id !== "string" || !UUID.test(id)) throw new Error("TASK_INVALID");
    if (patch.description !== undefined && (typeof patch.description !== "string" || patch.description.length > TASK_FILE_DESCRIPTION_MAX_LENGTH)) throw new Error("TASK_INVALID");
    this.invalidateTask(taskId);
    await this.mutate(taskId, (database) => {
      if (kind === "file") {
        const row = database.prepare("SELECT * FROM task_file_references WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, id);
        if (!row) throw new Error("TASK_ATTACHMENT_MISSING");
        const name = patch.name !== undefined ? this.requireDisplayName(patch.name) : String(row.name);
        const description = patch.description !== undefined ? patch.description : String(row.description ?? "");
        if (name === String(row.name) && description === String(row.description ?? "")) return;
        database.prepare("UPDATE task_file_references SET name=?,description=? WHERE namespace=? AND task_id=? AND id=?")
          .run(name, description, this.namespace, taskId, id);
      } else {
        const row = database.prepare("SELECT * FROM task_attachments WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, id);
        if (!row) throw new Error("TASK_ATTACHMENT_MISSING");
        const description = patch.description !== undefined ? patch.description : String(row.description ?? "");
        let name = String(row.name);
        let storageName = String(row.storage_name);
        if (patch.name !== undefined) {
          const proposed = proposedManagedFileName(patch.name, name);
          if ("reason" in proposed) throw new TaskFileRenameError(proposed.reason);
          if (path.basename(storageName) !== storageName) throw new TaskFileRenameError("reserved");
          const directory = this.attachmentDirectory(taskId);
          const source = path.join(directory, storageName);
          try { if (!statSync(source).isFile()) throw new TaskFileRenameError("missing"); }
          catch (error) { if (error instanceof TaskFileRenameError) throw error; throw new TaskFileRenameError("missing"); }
          const taken = database.prepare("SELECT 1 FROM task_attachments WHERE namespace=? AND task_id=? AND storage_name=? AND id!=?")
            .get(this.namespace, taskId, proposed.name, id);
          if (taken || (proposed.name !== storageName && existsSync(path.join(directory, proposed.name)))) {
            throw new TaskFileRenameError("collision");
          }
          if (proposed.name !== storageName) renameSync(source, path.join(directory, proposed.name));
          name = proposed.name;
          storageName = proposed.name;
        }
        if (name === String(row.name) && storageName === String(row.storage_name) && description === String(row.description ?? "")) return;
        database.prepare("UPDATE task_attachments SET name=?,storage_name=?,description=? WHERE namespace=? AND task_id=? AND id=?")
          .run(name, storageName, description, this.namespace, taskId, id);
      }
      touch(database, this.namespace, taskId);
    });
    return this.loaded(taskId);
  }

  async updateWebLink(taskId: string, id: string, title: string) {
    requireId(taskId, TASK_ID);
    if (typeof id !== "string" || !UUID.test(id) || typeof title !== "string" || title.length > TASK_LINK_TITLE_MAX_LENGTH) throw new Error("TASK_INVALID");
    this.invalidateTask(taskId);
    await this.mutate(taskId, (database) => {
      const row = database.prepare("SELECT url FROM task_web_links WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, id);
      if (!row) throw new Error("TASK_RESOURCE_CHANGED");
      const url = canonicalTaskLinkUrl(String(row.url));
      const rows = database.prepare("SELECT id,url FROM task_web_links WHERE namespace=? AND task_id=?").all(this.namespace, taskId)
        .filter((item) => canonicalTaskLinkUrl(String(item.url)) === url);
      if (!rows.length) throw new Error("TASK_RESOURCE_CHANGED");
      for (const item of rows) database.prepare("UPDATE task_web_links SET title=? WHERE namespace=? AND task_id=? AND id=?")
        .run(title.trim(), this.namespace, taskId, item.id);
      touch(database, this.namespace, taskId);
    });
    return this.loaded(taskId);
  }

  async resolveFilePath(taskId: string, kind: TaskManagedFileKind, id: string) {
    const resolved = await this.resolveFile(taskId, kind, id);
    return { path: resolved.fsPath, name: resolved.name };
  }

  private requireDisplayName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new TaskFileRenameError("empty");
    if (trimmed === "." || trimmed === ".." || /[\\/]/.test(trimmed) || trimmed !== path.basename(trimmed)) throw new TaskFileRenameError("separator");
    if (Buffer.byteLength(trimmed, "utf8") > 255) throw new TaskFileRenameError("too-long");
    return trimmed;
  }

  private async resolveFile(taskId: string, kind: TaskManagedFileKind, id: string) {
    requireId(taskId, TASK_ID);
    if (typeof id !== "string" || id.includes("/") || id.includes("\\") || !UUID.test(id)) throw new Error("TASK_INVALID");
    return this.withDatabase(async (database) => {
      requireTaskRow(database, this.namespace, taskId);
      if (kind === "file") {
        const row = database.prepare("SELECT * FROM task_file_references WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, id);
        if (!row) throw new Error("TASK_ATTACHMENT_MISSING");
        return { name: String(row.name), description: String(row.description ?? ""), size: Number(row.size), fsPath: String(row.path), displayPath: String(row.path), storageName: "" };
      }
      const row = database.prepare("SELECT * FROM task_attachments WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, id);
      if (!row) throw new Error("TASK_ATTACHMENT_MISSING");
      const storageName = String(row.storage_name);
      if (path.basename(storageName) !== storageName) throw new Error("TASK_INVALID");
      return {
        name: String(row.name), description: String(row.description ?? ""), size: Number(row.size),
        fsPath: path.join(this.attachmentDirectory(taskId), storageName), displayPath: storageName, storageName,
      };
    });
  }

  private async withDatabase<Result>(operation: (database: DatabaseSync) => Promise<Result> | Result) {
    const database = await openAppDatabase(this.filename);
    try { return await operation(database); } finally { database.close(); }
  }

  private normalized(items: TaskResourceRef[]) {
    if (!Array.isArray(items) || items.length > 200) throw new Error("TASK_INVALID");
    const seen = new Set<string>();
    const result: TaskResourceRef[] = [];
    for (const item of items) {
      if (!item || typeof item.kind !== "string" || typeof item.id !== "string") throw new Error("TASK_INVALID");
      // Issue 缓存键含 owner/repo，斜杠合法；其他资源 id 不能带路径分隔符。
      if (item.kind === "issue") {
        if (!item.id.trim() || item.id.includes("\\") || item.id.includes("\0")) throw new Error("TASK_INVALID");
      } else if (item.id.includes("/") || item.id.includes("\\")) {
        throw new Error("TASK_INVALID");
      }
      const key = item.kind + ":" + item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ kind: item.kind, id: item.id });
    }
    return result;
  }

  private expandLinks(database: DatabaseSync, taskId: string, items: TaskResourceRef[]) {
    const result: TaskResourceRef[] = [];
    for (const item of items) {
      if (item.kind !== "link") { result.push(item); continue; }
      const row = database.prepare("SELECT url FROM task_web_links WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, item.id);
      if (!row) { result.push(item); continue; }
      const url = canonicalTaskLinkUrl(String(row.url));
      const group = database.prepare("SELECT id,url FROM task_web_links WHERE namespace=? AND task_id=?").all(this.namespace, taskId)
        .filter((entry) => canonicalTaskLinkUrl(String(entry.url)) === url);
      for (const entry of group) result.push({ kind: "link", id: String(entry.id) });
    }
    return result;
  }

  private workspaceRows(database: DatabaseSync, taskId: string) {
    return database.prepare("SELECT position,data FROM task_resources WHERE namespace=? AND task_id=?").all(this.namespace, taskId)
      .map((row) => ({ position: Number(row.position), resource: JSON.parse(String(row.data)) as TaskResource }));
  }

  private workspaceDetachReason(database: DatabaseSync, taskId: string, resourceId: string): TaskResourceSkipReason | null {
    const rows = this.workspaceRows(database, taskId);
    if (!rows.some((row) => row.resource.resourceId === resourceId)) return "notFound";
    if (rows.length <= 1) return "lastWorkspace";
    if (this.isWorkspaceBusy?.(taskId, resourceId)) return "workspaceBusy";
    return null;
  }

  private readManaged(database: DatabaseSync, taskId: string, item: TaskResourceRef): { archivedAt?: string } | null {
    if (item.kind === "note") {
      if (item.id === TASK_PROMPT_ID || !UUID.test(item.id)) return null;
      const row = database.prepare("SELECT archived_at FROM task_notes WHERE namespace=? AND task_id=? AND id=? AND deleted_at IS NULL").get(this.namespace, taskId, item.id);
      return row ? { archivedAt: row.archived_at ? String(row.archived_at) : undefined } : null;
    }
    if (item.kind === "file") {
      const row = database.prepare("SELECT archived_at FROM task_file_references WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, item.id);
      return row ? { archivedAt: row.archived_at ? String(row.archived_at) : undefined } : null;
    }
    if (item.kind === "attachment") {
      const row = database.prepare("SELECT archived_at FROM task_attachments WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, item.id);
      return row ? { archivedAt: row.archived_at ? String(row.archived_at) : undefined } : null;
    }
    if (item.kind === "link") {
      const row = database.prepare("SELECT archived_at FROM task_web_links WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, item.id);
      return row ? { archivedAt: row.archived_at ? String(row.archived_at) : undefined } : null;
    }
    if (item.kind === "issue") {
      const row = database.prepare("SELECT data FROM task_links WHERE namespace=? AND task_id=? AND link_id=?").get(this.namespace, taskId, item.id);
      if (!row) return null;
      const link = JSON.parse(String(row.data)) as IssueItem & { archivedAt?: string };
      return { archivedAt: link.archivedAt };
    }
    return null;
  }

  private setArchivedAt(database: DatabaseSync, taskId: string, item: TaskResourceRef, archivedAt: string | null) {
    if (item.kind === "issue") {
      const row = database.prepare("SELECT data FROM task_links WHERE namespace=? AND task_id=? AND link_id=?").get(this.namespace, taskId, item.id);
      if (!row) throw new Error("TASK_INVALID");
      const link = JSON.parse(String(row.data)) as IssueItem & { archivedAt?: string };
      const next = { ...link };
      if (archivedAt) next.archivedAt = archivedAt; else delete next.archivedAt;
      database.prepare("UPDATE task_links SET data=? WHERE namespace=? AND task_id=? AND link_id=?")
        .run(JSON.stringify(next), this.namespace, taskId, item.id);
      return;
    }
    const tables: Record<string, [string, string]> = {
      note: ["task_notes", "id"], file: ["task_file_references", "id"], attachment: ["task_attachments", "id"], link: ["task_web_links", "id"],
    };
    const mapping = tables[item.kind];
    if (!mapping) throw new Error("TASK_INVALID");
    database.prepare(`UPDATE ${mapping[0]} SET archived_at=? WHERE namespace=? AND task_id=? AND ${mapping[1]}=?`)
      .run(archivedAt, this.namespace, taskId, item.id);
  }

  private readDetachable(database: DatabaseSync, taskId: string, item: TaskResourceRef): unknown {
    if (item.kind === "workspace") {
      const rows = this.workspaceRows(database, taskId);
      const row = rows.find((entry) => entry.resource.resourceId === item.id);
      if (!row) return null;
      const managed = database.prepare("SELECT path,branch,repository FROM managed_workspaces WHERE namespace=? AND task_id=? AND path=?")
        .get(this.namespace, taskId, row.resource.workingPath);
      const steps = database.prepare("SELECT id,data FROM task_initialization WHERE namespace=? AND task_id=?").all(this.namespace, taskId)
        .filter((step) => JSON.parse(String(step.data)).resourceId === item.id)
        .map((step) => ({ id: String(step.id), data: String(step.data) }));
      const projectName = String(database.prepare("SELECT project_name FROM tasks WHERE namespace=? AND id=?").get(this.namespace, taskId)?.project_name ?? "");
      return {
        resource: row.resource, position: row.position, steps, projectName,
        managed: managed ? { path: String(managed.path), branch: String(managed.branch), repository: String(managed.repository) } : undefined,
      };
    }
    if (item.kind === "issue") {
      const row = database.prepare("SELECT data FROM task_links WHERE namespace=? AND task_id=? AND link_id=?").get(this.namespace, taskId, item.id);
      return row ? { data: String(row.data) } : null;
    }
    if (item.kind === "link") {
      const row = database.prepare("SELECT * FROM task_web_links WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, item.id);
      return row ? linkColumns(row) : null;
    }
    if (item.kind === "file") {
      const row = database.prepare("SELECT * FROM task_file_references WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, item.id);
      return row ? fileColumns(row) : null;
    }
    if (item.kind === "attachment") {
      const row = database.prepare("SELECT * FROM task_attachments WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, item.id);
      return row ? attachmentColumns(row) : null;
    }
    return null;
  }

  private deleteManaged(database: DatabaseSync, taskId: string, item: TaskResourceRef, snapshot: unknown) {
    if (item.kind === "workspace") {
      const current = snapshot as { position: number; resource: TaskResource };
      database.prepare("DELETE FROM task_resources WHERE namespace=? AND task_id=? AND position=?").run(this.namespace, taskId, current.position);
      database.prepare("DELETE FROM managed_workspaces WHERE namespace=? AND task_id=? AND path=?").run(this.namespace, taskId, current.resource.workingPath);
      for (const step of database.prepare("SELECT id,data FROM task_initialization WHERE namespace=? AND task_id=?").all(this.namespace, taskId)) {
        if (JSON.parse(String(step.data)).resourceId === item.id) database.prepare("DELETE FROM task_initialization WHERE namespace=? AND task_id=? AND id=?").run(this.namespace, taskId, step.id);
      }
      const first = database.prepare("SELECT data FROM task_resources WHERE namespace=? AND task_id=? ORDER BY position LIMIT 1").get(this.namespace, taskId);
      database.prepare("UPDATE tasks SET project_name=? WHERE namespace=? AND id=?").run(first ? JSON.parse(String(first.data)).name : "", this.namespace, taskId);
      return;
    }
    if (item.kind === "issue") {
      database.prepare("DELETE FROM task_links WHERE namespace=? AND task_id=? AND link_id=?").run(this.namespace, taskId, item.id);
      return;
    }
    const tables: Record<string, [string, string]> = { link: ["task_web_links", "id"], file: ["task_file_references", "id"], attachment: ["task_attachments", "id"] };
    const mapping = tables[item.kind];
    if (!mapping) throw new Error("TASK_INVALID");
    database.prepare(`DELETE FROM ${mapping[0]} WHERE namespace=? AND task_id=? AND ${mapping[1]}=?`).run(this.namespace, taskId, item.id);
  }
}
