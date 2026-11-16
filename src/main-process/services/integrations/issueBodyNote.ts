import type { IssueItem } from "../../../domain/issues";
import type { TaskNote, TaskNoteInput } from "../../../shared/taskResourceTypes";
import { TASK_NOTE_CONTENT_LIMIT } from "../../../utils/taskNotes";

const MARKER_PREFIX = "<!-- navo-issue:";
const MARKER_SUFFIX = " -->";
const TRUNCATED = "\n\n正文已截断，完整内容见原链接。";

export function issueNoteMarker(issueId: string) {
  return `${MARKER_PREFIX}${issueId}${MARKER_SUFFIX}`;
}

export function noteBelongsToIssue(content: string, issueId: string) {
  return content.includes(issueNoteMarker(issueId));
}

export function existingIssueNote(notes: Pick<TaskNote, "content">[] | undefined, issueId: string) {
  return (notes ?? []).some((note) => noteBelongsToIssue(note.content, issueId));
}

export function issueNoteTitle(issue: IssueItem) {
  const number = issue.number?.trim() || "";
  const title = issue.title.trim();
  return [number, title].filter(Boolean).join(" ").trim() || title;
}

/** 每个任务的每个 Issue 只生成一次；本地条目和没有正文的条目不生成。 */
export function buildIssueBodyNote(issue: IssueItem, allNotes: Pick<TaskNote, "content">[] = []): TaskNoteInput | null {
  if (issue.source === "local" || issue.group !== "ISSUE" || !issue.body?.trim()) return null;
  if (existingIssueNote(allNotes, issue.id)) return null;
  const meta = [
    issue.nativeStatus || issue.status,
    issue.assignees?.map((item) => item.name || item.login).filter(Boolean).join(", "),
    issue.labels?.map((item) => item.name).filter(Boolean).join(", "),
  ].filter((item) => item && item.length).join(" · ");
  const header = [issueNoteMarker(issue.id), issue.url ? `[${issue.number ?? issue.title}](${issue.url})` : "", meta].filter(Boolean).join("\n");
  let content = `${header}\n\n${issue.body.trim()}`;
  if (content.length > TASK_NOTE_CONTENT_LIMIT) {
    const budget = TASK_NOTE_CONTENT_LIMIT - TRUNCATED.length;
    content = content.slice(0, Math.max(0, budget)) + TRUNCATED;
  }
  return { id: crypto.randomUUID(), title: issueNoteTitle(issue), content };
}
