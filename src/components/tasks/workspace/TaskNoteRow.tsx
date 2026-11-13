import { useRef, useState } from "react";
import { Copy, Download, FileText, Link, NotebookText, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskNoteInput } from "@/shared/taskResourceTypes";
import { TASK_PROMPT_ID } from "@/shared/taskContextTypes";
import { useTaskNoteCopy } from "@/hooks/useTaskNoteCopy";
import { getTasksApi } from "@/services/taskApi";
import { taskLink } from "@/shared/taskLinks";
import { taskNoteDraftKey, useTaskNoteDraftStore } from "@/stores/taskNoteDraftStore";
import { getTaskError } from "@/services/taskErrors";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";

interface TaskNoteRowProps {
  /** 笔记链接与文件导出的所属任务。 */
  taskId: string;
  /** 当前笔记；是否选中由右侧面板实际可见状态决定。 */
  note: TaskNoteInput;
  active: boolean;
  /** 归档或写入期间不允许删除，查看入口仍可用。 */
  deleteDisabled: boolean;
  onOpen: (id: string, trigger: HTMLButtonElement) => void;
  /** 仅请求删除确认，不切换预览或丢弃草稿；任务正文不传入此回调。 */
  onDelete?: (id: string) => void;
  /** 进入笔记标题就地改名；任务正文不提供。 */
  onRename?: (id: string, trigger: HTMLButtonElement) => void;
}
export function TaskNoteRow({ taskId, note, active, deleteDisabled, onOpen, onDelete, onRename }: TaskNoteRowProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const trigger = useRef<HTMLButtonElement>(null);
  const selectedAction = useRef(false);
  const title = note.title || t("tasks:resources.untitledNote");
  const { copy, copyFailed } = useTaskNoteCopy(note);
  const [error, setError] = useState<unknown>(null);
  const hasDraft = useTaskNoteDraftStore((state) => {
    const draft = state.drafts[taskNoteDraftKey(taskId, note.id)];
    return Boolean(draft && (draft.title !== draft.original.title || draft.content !== draft.original.content));
  });
  const Icon = note.id === TASK_PROMPT_ID ? FileText : NotebookText;
  function open() { if (trigger.current) onOpen(note.id, trigger.current); }
  function rename() { if (trigger.current && !deleteDisabled) onRename?.(note.id, trigger.current); }
  async function run(action: () => Promise<unknown>) { setError(null); try { await action(); } catch (failure) { setError(failure); } }
  return <><ContextMenu onOpenChange={(opened) => { if (opened) selectedAction.current = false; }}>
    <ContextMenuTrigger asChild><button ref={trigger} className="task-context-row" data-active={active} aria-pressed={active} title={title} onClick={open}
      onKeyDown={(event) => { if (event.key === "F2" && onRename) { event.preventDefault(); event.stopPropagation(); rename(); } }}>
      <span className="task-context-item-icon"><Icon /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs">{title}</span><span className="block truncate text-[10px] text-muted-foreground">text/markdown{hasDraft && ` · ${t("tasks:notes.unsavedDraft")}`}</span></span>
    </button></ContextMenuTrigger>
    <ContextMenuContent className="[&_svg]:size-3.5!" updatePositionStrategy="always" onCloseAutoFocus={(event) => { if (selectedAction.current) event.preventDefault(); }}>
      <ContextMenuItem onSelect={() => { selectedAction.current = true;open(); }}>{t("common:actions.open")}</ContextMenuItem>
      {onRename && <ContextMenuItem disabled={deleteDisabled} onSelect={() => { selectedAction.current = true; rename(); }}><Pencil />{t("tasks:notes.rename")}</ContextMenuItem>}
      <ContextMenuItem disabled={!note.content.trim()} onSelect={() => void run(() => getTasksApi().exportNote(taskId, note.id))}><Download />{t("tasks:notes.export")}</ContextMenuItem>
      <ContextMenuItem onSelect={() => void copy()}><Copy aria-hidden="true" />{t("tasks:notes.copy")}</ContextMenuItem>
      <ContextMenuItem onSelect={() => void run(() => navigator.clipboard.writeText(taskLink(taskId, note.id)))}><Link />{t("tasks:notes.copyLink")}</ContextMenuItem>
      {onDelete && <><ContextMenuSeparator />
        <ContextMenuItem variant="destructive" disabled={deleteDisabled} onSelect={() => { selectedAction.current = true;onDelete(note.id); }}><Trash2 aria-hidden="true" />{t("common:actions.delete")}</ContextMenuItem>
      </>}
    </ContextMenuContent>
  </ContextMenu>{copyFailed && <p role="alert" className="px-2 text-xs text-destructive">{t("tasks:notes.copyFailed")}</p>}{error !== null && <p role="alert" className="px-2 text-xs text-destructive">{getTaskError(error)}</p>}</>;
}
