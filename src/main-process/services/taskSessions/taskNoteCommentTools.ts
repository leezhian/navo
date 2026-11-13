import { randomUUID } from "node:crypto";
import type { Task } from "../../../domain/tasks";
import type { TaskContextNoteActions } from "./taskNoteTools";
import type { TaskNoteCommentInput } from "../../../shared/taskNoteTypes";
import { TASK_PROMPT_ID } from "../../../shared/taskContextTypes";

const annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
export const taskNoteCommentTools = [
  { name: "comment_task_note", description: "Add a comment or reply to a note in this task. Use the note version and exact Markdown line range and quote from get_task_note. Comments are saved context, not a message sent to another agent.",
    inputSchema: { type: "object", properties: { noteId: { type: "string" }, version: { type: "integer", minimum: 1 }, startLine: { type: "integer", minimum: 1 }, endLine: { type: "integer", minimum: 1 }, quote: { type: "string" }, body: { type: "string", minLength: 1, maxLength: 10000 }, parentId: { type: "string" } }, required: ["noteId", "version", "startLine", "endLine", "quote", "body"], additionalProperties: false }, annotations },
  { name: "resolve_task_note_comment", description: "Resolve or reopen a note comment in the current task, using its last-read updatedAt timestamp. Does not change the note body.",
    inputSchema: { type: "object", properties: { commentId: { type: "string" }, updatedAt: { type: "string" }, resolved: { type: "boolean" } }, required: ["commentId", "updatedAt", "resolved"], additionalProperties: false }, annotations: { ...annotations, idempotentHint: true } },
];

export async function callTaskNoteCommentTool(task: Task, sessionId: string, name: unknown, args: Record<string, unknown>, actions: TaskContextNoteActions | undefined, authorize: () => void) {
  const tool = taskNoteCommentTools.find((item) => item.name === name);
  if (!tool || !actions?.comment || !actions.changeComment || Object.keys(args).some((key) => !Object.prototype.hasOwnProperty.call(tool.inputSchema.properties, key))) throw new Error("TASK_INVALID");
  authorize();
  if (name === "comment_task_note") {
    const input = { id: randomUUID(), noteId: args.noteId, noteVersion: args.version, startLine: args.startLine, endLine: args.endLine, quote: args.quote, body: args.body,
      ...(args.parentId ? { parentId: args.parentId } : {}) } as TaskNoteCommentInput;
    const updated = await actions.comment(task.id, input, authorize, sessionId);
    const comments = input.noteId === TASK_PROMPT_ID ? updated.promptComments : updated.notes?.find((item) => item.id === input.noteId)?.comments;
    return { comment: comments?.find((item) => item.id === input.id), contextVersion: updated.contextVersion };
  }
  if (typeof args.commentId !== "string" || typeof args.updatedAt !== "string" || typeof args.resolved !== "boolean") throw new Error("TASK_INVALID");
  const updated = await actions.changeComment(task.id, args.commentId, args.updatedAt, { resolved: args.resolved }, authorize);
  return { id: args.commentId, resolved: args.resolved, contextVersion: updated.contextVersion };
}
