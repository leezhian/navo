import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TaskNote } from "@/shared/taskResourceTypes";
import type { TaskNoteComment } from "@/shared/taskNoteTypes";
import type { NoteLineSelection } from "./TaskNoteMarkdown";
import { useTaskStore } from "@/stores/taskStore";
import { getTaskError } from "@/services/taskErrors";
import { locateNoteComment } from "@/utils/taskNoteAnchors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export interface NoteCommentDraft extends NoteLineSelection { id: string; noteVersion: number; parentId?: string; body: string }
interface TaskNoteCommentsProps {
  /** 评论读写与任务版本更新共用主进程数据源。 */
  taskId: string;
  note: TaskNote;
  readOnly: boolean;
  /** 选中文本生成的评论草稿，正文编辑时不允许改变引用。 */
  draft: NoteCommentDraft | null;
  /** 持久化当前评论输入；传 null 仅清除这条笔记的评论草稿。 */
  onDraft: (draft: NoteCommentDraft | null) => void;
}
export function TaskNoteComments({ taskId, note, readOnly, draft, onDraft }: TaskNoteCommentsProps) {
  const { t, i18n } = useTranslation(["tasks", "common"]);
  const pending = useTaskStore((state) => state.pending);
  const [error, setError] = useState<unknown>(null), [showResolved, setShowResolved] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string; expected: string } | null>(null);
  const [deleting, setDeleting] = useState<TaskNoteComment | null>(null);
  const comments = note.comments ?? [];
  const threads = comments.filter((item) => !item.parentId && (showResolved || !item.resolvedAt));
  async function submit() {
    if (!draft?.body.trim() || pending || readOnly) return;
    try { await useTaskStore.getState().commentNote(taskId, { ...draft, noteId: note.id }); onDraft(null); setError(null); }
    catch (failure) { setError(failure); }
  }
  async function update(comment: TaskNoteComment, patch: { body?: string; resolved?: boolean; remove?: boolean }, expected = comment.updatedAt) {
    if (pending || readOnly) return;
    try { await useTaskStore.getState().changeNoteComment(taskId, comment.id, expected, patch); setEditing(null); setDeleting(null); setError(null); }
    catch (failure) { setError(failure); }
  }
  function reply(comment: TaskNoteComment) {
    if (draft) return;
    onDraft({ id: crypto.randomUUID(), noteVersion: note.version, startLine: comment.startLine, endLine: comment.endLine, quote: comment.quote, parentId: comment.id, body: "" });
  }
  function commentCard(comment: TaskNoteComment, isReply = false) {
    return <div key={comment.id} className={isReply ? "ml-3 border-l border-border pl-3" : ""}>
      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground"><span>{t(comment.actor === "agent" ? "tasks:notes.authorAgent" : "tasks:notes.authorYou")}</span><time>{new Date(comment.createdAt).toLocaleString(i18n.language)}</time></div>
      {editing?.id === comment.id ? <div className="mt-2 space-y-2">
        <textarea aria-label={t("tasks:notes.comments.body")} className="min-h-20 w-full rounded border border-input bg-transparent p-2 text-xs" maxLength={10000} disabled={pending || readOnly} value={editing.text} onChange={(event) => setEditing({ ...editing, text: event.target.value })} />
        <Button size="sm" disabled={pending || readOnly || !editing.text.trim()} onClick={() => void update(comment, { body: editing.text }, editing.expected)}>{t("common:actions.save")}</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(null)}>{t("common:actions.cancel")}</Button>
      </div> : <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-6">{comment.body}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {!isReply && <Button size="sm" variant="ghost" disabled={readOnly || pending || Boolean(draft)} onClick={() => reply(comment)}>{t("tasks:notes.comments.reply")}</Button>}
        {!isReply && <Button size="sm" variant="ghost" disabled={readOnly || pending} onClick={() => void update(comment, { resolved: !comment.resolvedAt })}>{t(comment.resolvedAt ? "tasks:notes.comments.reopen" : "tasks:notes.comments.resolve")}</Button>}
        <Button size="sm" variant="ghost" disabled={readOnly || pending} onClick={() => setEditing({ id: comment.id, text: comment.body, expected: comment.updatedAt })}>{t("common:actions.edit")}</Button>
        <Button size="sm" variant="ghost" disabled={readOnly || pending} onClick={() => { setError(null); setDeleting(comment); }}>{t("common:actions.delete")}</Button>
        <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(`${note.title}\n\n${comment.quote}\n\n${comment.body}`).catch(setError)}>{t("tasks:notes.comments.copyFeedback")}</Button>
      </div>
    </div>;
  }
  return <section className="mt-5 border-t border-border pt-3" aria-label={t("tasks:notes.comments.title")}>
    <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-medium">{t("tasks:notes.comments.title")}</h3><Button size="sm" variant="ghost" aria-pressed={showResolved} onClick={() => setShowResolved(!showResolved)}>{t(showResolved ? "tasks:notes.comments.hideResolved" : "tasks:notes.comments.showResolved")}</Button></div>
    <p className="mb-3 text-[11px] text-muted-foreground">{t("tasks:notes.comments.contextHint")}</p>
    {error !== null && <p role="alert" className="mb-2 text-xs text-destructive">{getTaskError(error)}</p>}
    <div className="space-y-4">{threads.map((comment) => <article key={comment.id} className="rounded-lg border border-border p-3">
      <blockquote className="mb-2 max-h-28 overflow-auto whitespace-pre-wrap border-l-2 border-border pl-2 font-mono text-[11px] text-muted-foreground">{comment.quote}</blockquote>
      {!locateNoteComment(note.content, comment) && <p className="mb-2 text-xs text-muted-foreground">{t("tasks:notes.comments.outdated")}</p>}
      {commentCard(comment)}<div className="mt-2 space-y-3">{comments.filter((item) => item.parentId === comment.id).map((item) => commentCard(item, true))}</div>
    </article>)}</div>
    {draft && <div data-note-comment-draft className="mt-3 space-y-2 rounded-lg border border-border p-3">
      <blockquote className="max-h-28 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{draft.quote}</blockquote>
      <textarea autoFocus aria-label={t("tasks:notes.comments.body")} placeholder={t("tasks:notes.comments.placeholder")} maxLength={10000} disabled={pending || readOnly}
        className="min-h-24 w-full resize-y rounded border border-input bg-transparent p-2 text-xs" value={draft.body} onChange={(event) => onDraft({ ...draft, body: event.target.value })}
        onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void submit(); } }} />
      <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" disabled={pending} onClick={() => onDraft(null)}>{t("common:actions.cancel")}</Button><Button size="sm" disabled={pending || readOnly || !draft.body.trim()} onClick={() => void submit()}>{t("tasks:notes.comments.save")}</Button></div>
    </div>}
    {!draft && !threads.length && <p className="text-xs text-muted-foreground">{t("tasks:notes.comments.empty")}</p>}
    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !pending) setDeleting(null); }}><DialogContent>
      <DialogTitle>{t("tasks:notes.comments.deleteTitle")}</DialogTitle><DialogDescription>{t("tasks:notes.comments.deleteDescription")}</DialogDescription>
      {error !== null && <p role="alert" className="text-xs text-destructive">{getTaskError(error)}</p>}
      <div className="flex justify-end gap-2"><Button variant="ghost" disabled={pending} onClick={() => setDeleting(null)}>{t("common:actions.cancel")}</Button><Button variant="destructive" disabled={pending || readOnly} onClick={() => { if (deleting) void update(deleting, { remove: true }); }}>{t("common:actions.delete")}</Button></div>
    </DialogContent></Dialog>
  </section>;
}
