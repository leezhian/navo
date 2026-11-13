import type { DatabaseSync } from "node:sqlite";
import type { TaskNoteComment, TaskNoteCommentInput } from "../../shared/taskNoteTypes";
import { isTaskNoteId, isTaskNoteVersion } from "../../utils/taskNotes";
import { TASK_PROMPT_ID } from "../../shared/taskContextTypes";

export function readTaskNoteComments(database: DatabaseSync, namespace: string, taskId: string, noteId: string): TaskNoteComment[] {
  return database.prepare("SELECT * FROM task_note_comments WHERE namespace=? AND task_id=? AND note_id=? ORDER BY created_at,rowid").all(namespace, taskId, noteId)
    .map((row) => ({ id: String(row.id), noteId, noteVersion: Number(row.note_version), startLine: Number(row.start_line), endLine: Number(row.end_line),
      quote: String(row.quote), body: String(row.body), actor: row.actor as TaskNoteComment["actor"],
      ...(row.parent_id ? { parentId: String(row.parent_id) } : {}), ...(row.session_id ? { sessionId: String(row.session_id) } : {}),
      ...(row.resolved_at ? { resolvedAt: String(row.resolved_at) } : {}), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }));
}

export function validNoteComment(input: TaskNoteCommentInput) {
  return input && isTaskNoteId(input.id) && (input.noteId === TASK_PROMPT_ID || isTaskNoteId(input.noteId))
    && isTaskNoteVersion(input.noteVersion) && Number.isSafeInteger(input.startLine) && input.startLine >= 1
    && Number.isSafeInteger(input.endLine) && input.endLine >= input.startLine
    && typeof input.quote === "string" && input.quote.length <= 100000
    && validCommentBody(input.body) && (input.parentId === undefined || isTaskNoteId(input.parentId));
}

export function validCommentBody(body: unknown): body is string {
  return typeof body === "string" && Boolean(body.trim()) && body.length <= 10000;
}
