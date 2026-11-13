import type { DatabaseSync } from "node:sqlite";
import type { TaskNote, TaskNoteInput, TaskNoteUpdate } from "../../shared/taskResourceTypes";
import { isTaskNoteId, isTaskNoteInput, isTaskNoteUpdate, isTaskNoteVersion } from "../../utils/taskNotes";
import { openAppDatabase } from "./appDatabase";
import { recordTaskNoteVersion, readTaskNoteHistory } from "./taskNoteHistory";
import { readTaskNoteComments, validCommentBody, validNoteComment } from "./taskNoteComments";
import type { TaskNoteCommentInput } from "../../shared/taskNoteTypes";
import { TASK_PROMPT_ID } from "../../shared/taskContextTypes";

export class TaskNoteVersionConflict extends Error {
  constructor(readonly currentVersion: number) { super("TASK_CONTENT_CHANGED"); }
}

export function readTaskNotes(database: DatabaseSync, namespace: string, taskId: string): TaskNote[] {
  return database.prepare(`SELECT n.*,h.actor AS last_editor,h.session_id AS last_editor_session FROM task_notes n
    LEFT JOIN task_note_history h ON h.namespace=n.namespace AND h.task_id=n.task_id AND h.note_id=n.id AND h.version=n.version
    WHERE n.namespace=? AND n.task_id=? ORDER BY n.sort_order,n.rowid`).all(namespace, taskId)
    .map((row) => ({ id: String(row.id), title: String(row.title), content: String(row.content), version: Number(row.version),
      origin: row.origin === "agent" ? "agent" : "user", ...(row.session_id ? { sessionId: String(row.session_id) } : {}),
      sortOrder: Number(row.sort_order), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
      lastEditor: row.last_editor === "agent" ? "agent" : row.last_editor === "user" ? "user" : "unknown",
      ...(row.last_editor_session ? { lastEditorSessionId: String(row.last_editor_session) } : {}),
      comments: readTaskNoteComments(database, namespace, taskId, String(row.id)) }));
}

/** 由调用方的任务事务包裹；来源只取可信会话，用户提交的附加字段不入库。 */
export function insertTaskNote(database: DatabaseSync, namespace: string, taskId: string, note: TaskNoteInput, sessionId?: string) {
  if (!isTaskNoteInput(note)) throw new Error("TASK_INVALID");
  const order = Number(database.prepare("SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM task_notes WHERE namespace=? AND task_id=?").get(namespace, taskId)?.next);
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO task_notes (namespace,task_id,id,title,content,version,origin,session_id,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,1,?,?,?,?,?)`).run(namespace, taskId, note.id, note.title.trim(), note.content, sessionId ? "agent" : "user", sessionId ?? null, order, now, now);
  recordTaskNoteVersion(database, namespace, taskId, note.id, "create", sessionId);
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

  update(taskId: string, note: TaskNoteUpdate, expectedVersion: number, authorize?: () => void, sessionId?: string) {
    if (!isTaskNoteUpdate(note) || !isTaskNoteVersion(expectedVersion)) throw new Error("TASK_INVALID");
    return this.mutate(taskId, (database) => {
      const current = this.requireNote(database, taskId, note.id, expectedVersion);
      const order = note.sortOrder ?? Number(current.sort_order);
      if (current.title === note.title.trim() && current.content === note.content && current.sort_order === order) return false;
      database.prepare("UPDATE task_notes SET title=?,content=?,sort_order=?,version=version+1,updated_at=? WHERE namespace=? AND task_id=? AND id=?")
        .run(note.title.trim(), note.content, order, new Date().toISOString(), this.namespace, taskId, note.id);
      recordTaskNoteVersion(database, this.namespace, taskId, note.id, "edit", sessionId);
      return true;
    }, authorize);
  }

  remove(taskId: string, noteId: string, expectedVersion: number, authorize?: () => void) {
    if (!isTaskNoteId(noteId) || !isTaskNoteVersion(expectedVersion)) throw new Error("TASK_INVALID");
    return this.mutate(taskId, (database) => {
      this.requireNote(database, taskId, noteId, expectedVersion);
      database.prepare("DELETE FROM task_notes WHERE namespace=? AND task_id=? AND id=?").run(this.namespace, taskId, noteId);
      database.prepare("DELETE FROM task_note_comments WHERE namespace=? AND task_id=? AND note_id=?").run(this.namespace, taskId, noteId);
      database.prepare("DELETE FROM task_note_history WHERE namespace=? AND task_id=? AND note_id=?").run(this.namespace, taskId, noteId);
      return true;
    }, authorize);
  }

  async history(taskId: string, noteId: string) {
    const database = await openAppDatabase(this.filename);
    try { return readTaskNoteHistory(database, this.namespace, taskId, noteId); }
    finally { database.close(); }
  }

  restore(taskId: string, noteId: string, version: number, expectedVersion: number) {
    if (!isTaskNoteVersion(version) || !isTaskNoteVersion(expectedVersion)) throw new Error("TASK_INVALID");
    return this.mutate(taskId, (database) => {
      const current = this.requireNote(database, taskId, noteId, expectedVersion);
      const snapshot = readTaskNoteHistory(database, this.namespace, taskId, noteId).find((item) => item.version === version);
      if (!snapshot) throw new Error("TASK_NOTE_NOT_FOUND");
      if (snapshot.content === current.content && snapshot.title === current.title) return false;
      if (noteId === TASK_PROMPT_ID) database.prepare("UPDATE tasks SET description=?,prompt_version=prompt_version+1 WHERE namespace=? AND id=?")
        .run(snapshot.content, this.namespace, taskId);
      else database.prepare("UPDATE task_notes SET title=?,content=?,version=version+1,updated_at=? WHERE namespace=? AND task_id=? AND id=?")
        .run(snapshot.title, snapshot.content, new Date().toISOString(), this.namespace, taskId, noteId);
      recordTaskNoteVersion(database, this.namespace, taskId, noteId, "restore", undefined, version);
      return true;
    });
  }

  comment(taskId: string, input: TaskNoteCommentInput, authorize?: () => void, sessionId?: string) {
    if (!validNoteComment(input)) throw new Error("TASK_INVALID");
    return this.mutate(taskId, (database) => {
      const existing = database.prepare("SELECT note_id,body,parent_id FROM task_note_comments WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, input.id);
      if (existing) {
        if (existing.note_id !== input.noteId || existing.body !== input.body.trim() || existing.parent_id !== (input.parentId ?? null)) throw new Error("TASK_CONTENT_CHANGED");
        return false;
      }
      const note = this.requireNote(database, taskId, input.noteId, input.noteVersion);
      const lines = String(note.content).split("\n");
      let anchor = { version: input.noteVersion, start: input.startLine, end: input.endLine, quote: input.quote };
      if (input.parentId) {
        const parent = database.prepare("SELECT * FROM task_note_comments WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, input.parentId);
        if (!parent || parent.parent_id || parent.note_id !== input.noteId) throw new Error("TASK_INVALID");
        anchor = { version: Number(parent.note_version), start: Number(parent.start_line), end: Number(parent.end_line), quote: String(parent.quote) };
      } else if (input.endLine > lines.length || lines.slice(input.startLine - 1, input.endLine).join("\n") !== input.quote) throw new Error("TASK_CONTENT_CHANGED");
      const now = new Date().toISOString();
      database.prepare("INSERT INTO task_note_comments VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(this.namespace, taskId, input.noteId, input.id,
        anchor.version, anchor.start, anchor.end, anchor.quote, input.body.trim(), input.parentId ?? null, sessionId ? "agent" : "user", sessionId ?? null, null, now, now);
      return true;
    }, authorize);
  }

  changeComment(taskId: string, commentId: string, expectedUpdatedAt: string, patch: { body?: string; resolved?: boolean; remove?: boolean }, authorize?: () => void) {
    if (!isTaskNoteId(commentId) || !patch || !Number.isFinite(Date.parse(expectedUpdatedAt))
      || (patch.body !== undefined && !validCommentBody(patch.body))
      || (patch.resolved !== undefined && typeof patch.resolved !== "boolean")
      || (patch.remove !== undefined && typeof patch.remove !== "boolean")) throw new Error("TASK_INVALID");
    return this.mutate(taskId, (database) => {
      const current = database.prepare("SELECT * FROM task_note_comments WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, commentId);
      if (!current) throw new Error("TASK_NOTE_NOT_FOUND");
      if (current.updated_at !== expectedUpdatedAt) throw new Error("TASK_CONTENT_CHANGED");
      if (patch.remove) database.prepare("DELETE FROM task_note_comments WHERE namespace=? AND task_id=? AND (id=? OR parent_id=?)").run(this.namespace, taskId, commentId, commentId);
      else {
        const body = patch.body?.trim() ?? String(current.body);
        const resolved = patch.resolved === undefined ? current.resolved_at : patch.resolved ? current.resolved_at ?? new Date().toISOString() : null;
        if (body === current.body && resolved === current.resolved_at) return false;
        // 时间作为评论的乐观锁，同毫秒连续修改也必须得到不同的值。
        const now = new Date(Math.max(Date.now(), Date.parse(expectedUpdatedAt) + 1)).toISOString();
        database.prepare("UPDATE task_note_comments SET body=?,resolved_at=?,updated_at=? WHERE namespace=? AND task_id=? AND id=?")
          .run(body, resolved, now, this.namespace, taskId, commentId);
      }
      return true;
    }, authorize);
  }

  private requireNote(database: DatabaseSync, taskId: string, noteId: string, expectedVersion: number) {
    const note = noteId === TASK_PROMPT_ID
      ? database.prepare("SELECT 'Prompt' AS title,description AS content,prompt_version AS version FROM tasks WHERE namespace=? AND id=?").get(this.namespace, taskId)
      : database.prepare("SELECT title,content,version,sort_order FROM task_notes WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, noteId);
    if (!note) throw new Error("TASK_NOTE_NOT_FOUND");
    if (note.version !== expectedVersion) throw new TaskNoteVersionConflict(Number(note.version));
    return note;
  }
}
