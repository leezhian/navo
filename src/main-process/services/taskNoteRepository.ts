import type { DatabaseSync } from "node:sqlite";
import type { TaskNote, TaskNoteInput, TaskNoteUpdate } from "../../shared/taskResourceTypes";
import { isTaskNoteId, isTaskNoteInput, isTaskNoteUpdate, isTaskNoteVersion } from "../../utils/taskNotes";
import { openAppDatabase } from "./appDatabase";

export class TaskNoteVersionConflict extends Error {
  constructor(readonly currentVersion: number) { super("TASK_CONTENT_CHANGED"); }
}

export function readTaskNotes(database: DatabaseSync, namespace: string, taskId: string): TaskNote[] {
  return database.prepare("SELECT * FROM task_notes WHERE namespace=? AND task_id=? ORDER BY sort_order,rowid").all(namespace, taskId)
    .map((row) => ({ id: String(row.id), title: String(row.title), content: String(row.content), version: Number(row.version),
      origin: row.origin === "agent" ? "agent" : "user", ...(row.session_id ? { sessionId: String(row.session_id) } : {}),
      sortOrder: Number(row.sort_order), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }));
}

/** 由调用方的任务事务包裹；来源只取可信会话，用户提交的附加字段不入库。 */
export function insertTaskNote(database: DatabaseSync, namespace: string, taskId: string, note: TaskNoteInput, sessionId?: string) {
  if (!isTaskNoteInput(note)) throw new Error("TASK_INVALID");
  const order = Number(database.prepare("SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM task_notes WHERE namespace=? AND task_id=?").get(namespace, taskId)?.next);
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO task_notes (namespace,task_id,id,title,content,version,origin,session_id,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,1,?,?,?,?,?)`).run(namespace, taskId, note.id, note.title.trim(), note.content, sessionId ? "agent" : "user", sessionId ?? null, order, now, now);
}

export class TaskNoteRepository {
  constructor(private readonly filename: string, private readonly namespace: string) {}

  /** 凭证在等候队列及数据库打开后再检查，防止会话结束后仍提交排队写入。 */
  private async mutate(taskId: string, operation: (database: DatabaseSync) => boolean, authorize?: () => void) {
    if (typeof taskId !== "string") throw new Error("TASK_INVALID");
    const database = await openAppDatabase(this.filename);
    let transactionOpen = false;
    try {
      authorize?.();
      database.exec("BEGIN IMMEDIATE"); transactionOpen = true;
      const task = database.prepare("SELECT status FROM tasks WHERE namespace=? AND id=?").get(this.namespace, taskId);
      if (!task) throw new Error("TASK_NOT_FOUND");
      if (task.status === "ARCHIVED" || database.prepare("SELECT 1 FROM task_deletions WHERE namespace=? AND task_id=?").get(this.namespace, taskId)) throw new Error("TASK_BUSY");
      if (operation(database)) database.prepare("UPDATE tasks SET updated_at=?,context_version=context_version+1 WHERE namespace=? AND id=?")
        .run(new Date().toISOString(), this.namespace, taskId);
      database.exec("COMMIT"); transactionOpen = false;
    } catch (error) { if (transactionOpen) database.exec("ROLLBACK"); throw error; }
    finally { database.close(); }
  }

  create(taskId: string, note: TaskNoteInput, sessionId: string, authorize: () => void) {
    if (!isTaskNoteInput(note) || !sessionId) throw new Error("TASK_INVALID");
    return this.mutate(taskId, (database) => { insertTaskNote(database, this.namespace, taskId, note, sessionId); return true; }, authorize);
  }

  update(taskId: string, note: TaskNoteUpdate, expectedVersion: number, authorize?: () => void) {
    if (!isTaskNoteUpdate(note) || !isTaskNoteVersion(expectedVersion)) throw new Error("TASK_INVALID");
    return this.mutate(taskId, (database) => {
      const current = this.requireNote(database, taskId, note.id, expectedVersion);
      const order = note.sortOrder ?? Number(current.sort_order);
      if (current.title === note.title.trim() && current.content === note.content && current.sort_order === order) return false;
      database.prepare("UPDATE task_notes SET title=?,content=?,sort_order=?,version=version+1,updated_at=? WHERE namespace=? AND task_id=? AND id=?")
        .run(note.title.trim(), note.content, order, new Date().toISOString(), this.namespace, taskId, note.id);
      return true;
    }, authorize);
  }

  remove(taskId: string, noteId: string, expectedVersion: number, authorize?: () => void) {
    if (!isTaskNoteId(noteId) || !isTaskNoteVersion(expectedVersion)) throw new Error("TASK_INVALID");
    return this.mutate(taskId, (database) => {
      this.requireNote(database, taskId, noteId, expectedVersion);
      database.prepare("DELETE FROM task_notes WHERE namespace=? AND task_id=? AND id=?").run(this.namespace, taskId, noteId);
      return true;
    }, authorize);
  }

  private requireNote(database: DatabaseSync, taskId: string, noteId: string, expectedVersion: number) {
    const note = database.prepare("SELECT title,content,version,sort_order FROM task_notes WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, noteId);
    if (!note) throw new Error("TASK_NOTE_NOT_FOUND");
    if (note.version !== expectedVersion) throw new TaskNoteVersionConflict(Number(note.version));
    return note;
  }
}
