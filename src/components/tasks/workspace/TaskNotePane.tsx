import { lazy, Suspense, useRef, useState } from "react";
import { Check, Copy, Download, Ellipsis, History, Link, NotebookText, Pencil, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskNoteEditor } from "@/hooks/useTaskNoteEditor";
import { useTaskNoteCopy } from "@/hooks/useTaskNoteCopy";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { getTaskError } from "@/services/taskErrors";
import { getTasksApi } from "@/services/taskApi";
import { useTaskStore } from "@/stores/taskStore";
import { taskLink } from "@/shared/taskLinks";
import { useReadingPosition } from "@/hooks/useReadingPosition";
import { readingPositionKey } from "@/stores/readingPositionStore";
import { TaskMarkdownEditor } from "./TaskMarkdownEditor";
import { TaskNoteMarkdown, type NoteLineSelection } from "./TaskNoteMarkdown";
import { TaskNoteTitle } from "./TaskNoteTitle";
import { TaskNoteProvenance } from "./TaskNoteProvenance";
import { TaskNoteComments, type NoteCommentDraft } from "./TaskNoteComments";
import { toggleNoteChecklist } from "@/utils/taskNoteAnchors";
import { useTaskNoteDraftStore, taskNoteDraftKey } from "@/stores/taskNoteDraftStore";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const TaskNoteHistory = lazy(() => import("./TaskNoteHistory"));

interface TaskNotePaneProps {
  /** 正文与笔记的位置按所属任务隔离。 */
  taskId: string;
  /** 草稿由工作台持有，宽屏面板和窄屏抽屉切换时不丢失编辑内容。 */
  editor: TaskNoteEditor;
  /** 关闭面板保留未提交草稿。 */
  onClose: () => void;
  /** 来源会话仍存在时定位到该会话。 */
  onSession?: (id: string) => void;
  /** 上下文菜单请求就地改名。 */
  renameRequested?: boolean;
  onRenameHandled?: () => void;
}

export function TaskNotePane({ taskId, editor, onClose, onSession, renameRequested, onRenameHandled }: TaskNotePaneProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const { note, draft, busy, pending, readOnly } = editor;
  const paneRef = useRef<HTMLElement>(null);
  const previewRef = useReadingPosition<HTMLDivElement>(note && readingPositionKey(taskId, "note", note.id, "preview"));
  const editorRef = useReadingPosition<HTMLTextAreaElement>(note && readingPositionKey(taskId, "note", note.id, "editor"));
  const [historyNoteId, setHistoryNoteId] = useState<string>();
  const [actionError, setActionError] = useState<unknown>(null);
  const [localRename, setLocalRename] = useState(false);
  const commentDraft = useTaskNoteDraftStore((state) => note ? state.commentDrafts[taskNoteDraftKey(taskId, note.id)] ?? null : null);
  const { copy, copied, copyFailed } = useTaskNoteCopy(note && { ...note, content: draft?.content ?? note.content });
  if (!note) return null;
  const saveCommentDraft = (next: NoteCommentDraft | null) => next ? useTaskNoteDraftStore.getState().writeComment(taskId, { ...next, noteId: note.id }) : useTaskNoteDraftStore.getState().clearComment(taskId, note.id);
  const showHistory = historyNoteId === note.id;
  const title = note.title || t("tasks:resources.untitledNote");
  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try { await action(); } catch (failure) { setActionError(failure); }
  }
  async function checklist(line: number, checked: boolean) {
    if (!note || readOnly || pending || editor.hasDraft) return;
    const content = toggleNoteChecklist(note.content, line, checked);
    if (content === note.content) return;
    await run(() => editor.isPrompt
      ? useTaskStore.getState().updatePrompt(taskId, content, note.content, note.version)
      : useTaskStore.getState().updateNote(taskId, { id: note.id, title: note.title, content }, note.version));
  }
  function comment(selection: NoteLineSelection) {
    if (!note || commentDraft) return;
    saveCommentDraft({ ...selection, id: crypto.randomUUID(), noteVersion: note.version, body: "" });
    requestAnimationFrame(() => paneRef.current?.querySelector("[data-note-comment-draft] textarea")?.scrollIntoView({ block: "nearest" }));
  }
  return <section ref={paneRef} className="task-workbench-panel task-note-pane" aria-label={t("tasks:notes.title")} aria-busy={busy} onKeyDown={(event) => {
    if (event.nativeEvent.isComposing) return;
    if (draft && (event.metaKey || event.ctrlKey) && ["Enter", "s"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); void editor.save(); }
    if (draft && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); editor.leave(() => undefined); }
  }}>
    <header className="task-workbench-panel-heading">
      <div className="flex min-w-0 flex-1 items-center gap-2"><NotebookText className="shrink-0" />
        {editor.isPrompt ? <span className="truncate text-xs" title={title}>{title}</span> : <TaskNoteTitle key={note.id} taskId={taskId} note={note} readOnly={readOnly || busy} requested={renameRequested || localRename} onRequestedHandled={() => { setLocalRename(false); onRenameHandled?.(); }} />}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <IconTooltip label={t(copied ? "common:feedback.copied" : "tasks:notes.copy")} size="icon-xs" onClick={() => void copy()}>{copied ? <Check /> : <Copy />}</IconTooltip>
        <IconTooltip label={t("tasks:notes.export")} size="icon-xs" onClick={() => void run(() => getTasksApi().exportNote(taskId, note.id))}><Download /></IconTooltip>
        <IconTooltip label={t("tasks:notes.history.title")} size="icon-xs" onClick={() => setHistoryNoteId(showHistory ? undefined : note.id)}><History /></IconTooltip>
        {!draft && <IconTooltip label={t(editor.hasDraft ? "tasks:notes.resumeDraft" : "tasks:notes.edit")} size="icon-xs" disabled={readOnly || pending} onClick={() => { setHistoryNoteId(undefined); editor.edit(); }}><Pencil /></IconTooltip>}
        <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-xs" variant="ghost" aria-label={t("tasks:notes.actions")}><Ellipsis /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {!editor.isPrompt && <DropdownMenuItem disabled={readOnly || pending} onSelect={() => setLocalRename(true)}><Pencil />{t("tasks:notes.rename")}</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => void run(() => navigator.clipboard.writeText(taskLink(taskId, note.id)))}><Link />{t("tasks:notes.copyLink")}</DropdownMenuItem>
            {!editor.isPrompt && <DropdownMenuItem variant="destructive" disabled={readOnly || pending} onSelect={() => editor.requestDelete()}><Trash2 />{t("tasks:notes.delete")}</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
        <IconTooltip label={t("tasks:notes.close")} size="icon-xs" disabled={busy} onClick={onClose}><X /></IconTooltip>
      </div>
    </header>
    {copyFailed && <p role="alert" className="px-3 pt-2 text-xs text-destructive">{t("tasks:notes.copyFailed")}</p>}
    {editor.draftStorageFailed && <p role="alert" className="px-3 pt-2 text-xs text-destructive">{t("tasks:notes.draftStorageFailed")}</p>}
    {(actionError !== null || editor.error !== null) && <p role="alert" className="px-3 pt-2 text-xs text-destructive">{getTaskError(actionError ?? editor.error)}</p>}
    {showHistory ? <Suspense fallback={<p className="p-3 text-xs">{t("common:status.loading")}</p>}><TaskNoteHistory editor={editor} onBack={() => setHistoryNoteId(undefined)} /></Suspense> : draft ? <div data-note-editor className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <TaskMarkdownEditor textareaRef={editorRef} value={draft.content} disabled={busy || readOnly} onChange={(content) => editor.change({ content })} />
      <p className="text-[11px] text-muted-foreground">{t("tasks:notes.draftHint")}</p>
      <footer className="flex shrink-0 justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={editor.cancel}>{t("common:actions.cancel")}</Button>
        <Button size="sm" disabled={pending || busy || readOnly || !editor.dirty} onClick={() => void editor.save(String(editor.error).includes("TASK_CONTENT_CHANGED"))}>{t(busy ? "common:status.saving" : String(editor.error).includes("TASK_CONTENT_CHANGED") ? "tasks:notes.saveAnyway" : "common:actions.save")}</Button>
      </footer>
    </div> : <div ref={previewRef} className="min-h-0 flex-1 overflow-auto p-4">
      <TaskNoteProvenance note={note} onSession={onSession} />
      {editor.hasDraft && <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><span>{t("tasks:notes.unsavedDraft")}</span><Button size="sm" variant="ghost" disabled={readOnly || pending} onClick={editor.edit}>{t("tasks:notes.resumeDraft")}</Button></div>}
      <TaskNoteMarkdown content={note.content} onChecklist={readOnly || pending || editor.hasDraft ? undefined : (line, checked) => void checklist(line, checked)} onComment={readOnly || pending ? undefined : comment} />
      <TaskNoteComments key={note.id} taskId={taskId} note={note} readOnly={readOnly} draft={commentDraft} onDraft={saveCommentDraft} />
    </div>}
  </section>;
}
