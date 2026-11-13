import { randomUUID } from "node:crypto";
import type { Task } from "../../../domain/tasks";
import type { TaskNoteInput, TaskNoteUpdate } from "../../../shared/taskResourceTypes";
import { isTaskNoteId, isTaskNoteInput, isTaskNoteUpdate, isTaskNoteVersion, TASK_NOTE_CONTENT_LIMIT, TASK_NOTE_TITLE_LIMIT } from "../../../utils/taskNotes";
import { TaskNoteVersionConflict } from "../taskNoteRepository";
import type { TaskNoteCommentInput } from "../../../shared/taskNoteTypes";

/** 写入必须走任务服务队列；授权检查需传到数据库事务边界。 */
export interface TaskContextNoteActions {
  create(taskId: string, note: TaskNoteInput, sessionId: string, authorize: () => void): Promise<Task>;
  update(taskId: string, note: TaskNoteUpdate, version: number, authorize: () => void, sessionId?: string): Promise<Task>;
  remove(taskId: string, noteId: string, version: number, authorize: () => void): Promise<Task>;
  comment?(taskId: string, input: TaskNoteCommentInput, authorize: () => void, sessionId: string): Promise<Task>;
  changeComment?(taskId: string, id: string, expected: string, patch: { body?: string; resolved?: boolean }, authorize: () => void): Promise<Task>;
}

const title = { type: "string", maxLength: TASK_NOTE_TITLE_LIMIT, description: "Optional note title; an empty title is allowed." };
const content = { type: "string", maxLength: TASK_NOTE_CONTENT_LIMIT, description: "Markdown source." };
const noteId = { type: "string", description: "Note id from get_task_context or get_task_note, within this task." };
const version = { type: "integer", minimum: 1, description: "The note version last read. On conflict, read again before deciding what to change." };
const annotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
const hasField = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
export const taskNoteTools = [
  { name: "create_task_note", description: "Create a Markdown note in the current task. Records this session as its author; returns the note and version.",
    inputSchema: { type: "object", properties: { title, content: { ...content, minLength: 1 } }, required: ["content"], additionalProperties: false }, annotations: { ...annotations, destructiveHint: false } },
  { name: "update_task_note", description: "Update a note in this task using its last-read version. Specify title, content or sortOrder; omitted fields are preserved. Never silently overwrite a version conflict.",
    inputSchema: { type: "object", properties: { noteId, version, title, content, sortOrder: { type: "integer", minimum: 0, description: "Display order; lower values appear first. Ties keep insertion order." } }, required: ["noteId", "version"], additionalProperties: false }, annotations },
  { name: "delete_task_note", description: "Permanently delete a note from the current task using its last-read version. Read the note first and only delete it when appropriate for the user's task.",
    inputSchema: { type: "object", properties: { noteId, version }, required: ["noteId", "version"], additionalProperties: false }, annotations },
];

export async function callTaskNoteTool(task: Task, sessionId: string, name: unknown, args: Record<string, unknown>, actions: TaskContextNoteActions | undefined, authorize: () => void) {
  const tool = taskNoteTools.find((item) => item.name === name);
  if (!actions || !tool || Object.keys(args).some((key) => !hasField(tool.inputSchema.properties, key))) throw new Error("TASK_INVALID");
  authorize();
  if (name === "create_task_note") {
    const note = { id: randomUUID(), title: hasField(args, "title") ? args.title : "", content: args.content } as TaskNoteInput;
    if (!isTaskNoteInput(note)) throw new Error("TASK_INVALID");
    const updated = await actions.create(task.id, note, sessionId, authorize);
    return { ...updated.notes?.find((item) => item.id === note.id), contextVersion: updated.contextVersion };
  }
  if (!isTaskNoteId(args.noteId) || !isTaskNoteVersion(args.version)) throw new Error("TASK_INVALID");
  const current = task.notes?.find((note) => note.id === args.noteId);
  if (!current) throw new Error("TASK_NOTE_NOT_FOUND");
  if (name === "delete_task_note") {
    const updated = await actions.remove(task.id, args.noteId, args.version, authorize);
    return { id: args.noteId, deleted: true, contextVersion: updated.contextVersion };
  }
  if (!["title", "content", "sortOrder"].some((key) => hasField(args, key))) throw new Error("TASK_INVALID");
  const note = { id: args.noteId, title: hasField(args, "title") ? args.title : current.title,
    content: hasField(args, "content") ? args.content : current.content,
    ...(hasField(args, "sortOrder") ? { sortOrder: args.sortOrder } : {}) } as TaskNoteUpdate;
  if (!isTaskNoteUpdate(note)) throw new Error("TASK_INVALID");
  const updated = await actions.update(task.id, note, args.version, authorize, sessionId);
  return { ...updated.notes?.find((item) => item.id === note.id), contextVersion: updated.contextVersion };
}

export function taskNoteToolError(error: unknown) {
  if (error instanceof TaskNoteVersionConflict) return { code: "TASK_CONTENT_CHANGED", currentVersion: error.currentVersion,
    message: "The note changed. Read it with get_task_note and reconcile your edit before retrying with its current version." };
  const messages: Record<string, string> = {
    TASK_INVALID: "Invalid tool arguments. Use only the fields in this tool's schema.",
    TASK_NOTE_NOT_FOUND: "This note does not exist in the current task. Read get_task_context again.",
    TASK_NOT_FOUND: "The task is unavailable.",
    TASK_BUSY: "The task is archived or being deleted; changes are not allowed.",
    SESSION_CONTEXT_UNAVAILABLE: "This session's task context access has ended.",
  };
  const code = error instanceof Error && hasField(messages, error.message) ? error.message : "TASK_CONTEXT_UNAVAILABLE";
  return { code, message: messages[code] ?? "Task context unavailable. The operation could not be completed." };
}
