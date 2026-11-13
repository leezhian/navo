import type { DatabaseSync } from "node:sqlite";
import type { TaskNoteVersion } from "../../shared/taskNoteTypes";
import { TASK_PROMPT_ID } from "../../shared/taskContextTypes";

/** 与正文更新在同一事务内保存不可变快照。 */
export function recordTaskNoteVersion(database: DatabaseSync, namespace: string, taskId: string, noteId: string,
  kind: TaskNoteVersion["kind"], sessionId?: string, restoredFrom?: number) {
  const row = noteId === TASK_PROMPT_ID
    ? database.prepare("SELECT 'Prompt' AS title,description AS content,prompt_version AS version,date AS created_at FROM tasks WHERE namespace=? AND id=?").get(namespace, taskId)
    : database.prepare("SELECT title,content,version,created_at FROM task_notes WHERE namespace=? AND task_id=? AND id=?").get(namespace, taskId, noteId);
  if (!row) throw new Error("TASK_NOTE_NOT_FOUND");
  database.prepare("INSERT INTO task_note_history VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(namespace, taskId, noteId,
    Number(row.version), String(row.title), String(row.content), kind, sessionId ? "agent" : "user", sessionId ?? null, kind === "create" ? String(row.created_at) : new Date().toISOString(), restoredFrom ?? null);
}

export function readTaskNoteHistory(database: DatabaseSync, namespace: string, taskId: string, noteId: string): TaskNoteVersion[] {
  return database.prepare("SELECT * FROM task_note_history WHERE namespace=? AND task_id=? AND note_id=? ORDER BY version DESC").all(namespace, taskId, noteId)
    .map((row) => ({ noteId, version: Number(row.version), title: String(row.title), content: String(row.content),
      kind: row.kind as TaskNoteVersion["kind"], actor: row.actor as TaskNoteVersion["actor"],
      ...(row.session_id ? { sessionId: String(row.session_id) } : {}), createdAt: String(row.created_at),
      ...(row.restored_from ? { restoredFrom: Number(row.restored_from) } : {}) }));
}
