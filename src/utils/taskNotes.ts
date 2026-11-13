import type { TaskNoteInput, TaskNoteUpdate } from "../shared/taskResourceTypes";

export const TASK_NOTE_TITLE_LIMIT = 160;
export const TASK_NOTE_CONTENT_LIMIT = 100000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function isTaskNoteId(id: unknown): id is string { return typeof id === "string" && UUID.test(id); }
export function isTaskNoteVersion(version: unknown): version is number { return typeof version === "number" && Number.isSafeInteger(version) && version > 0; }
export function isTaskNoteOrder(order: unknown): order is number { return typeof order === "number" && Number.isSafeInteger(order) && order >= 0; }
export function isTaskNoteInput(note: TaskNoteInput | null | undefined): note is TaskNoteInput {
  return Boolean(note && isTaskNoteId(note.id) && typeof note.title === "string" && note.title.length <= TASK_NOTE_TITLE_LIMIT
    && typeof note.content === "string" && note.content.trim() && note.content.length <= TASK_NOTE_CONTENT_LIMIT);
}
export function isTaskNoteUpdate(note: TaskNoteUpdate | null | undefined): note is TaskNoteUpdate {
  // 已有笔记允许清空正文；新建仍要求提供内容。
  return Boolean(note && isTaskNoteId(note.id) && typeof note.title === "string" && note.title.length <= TASK_NOTE_TITLE_LIMIT
    && typeof note.content === "string" && note.content.length <= TASK_NOTE_CONTENT_LIMIT
    && (note.sortOrder === undefined || isTaskNoteOrder(note.sortOrder)));
}
