import { useRef } from "react";
import { Copy, FileText, NotebookText, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskNoteInput } from "@/shared/taskResourceTypes";
import { TASK_PROMPT_ID } from "@/shared/taskContextTypes";
import { useTaskNoteCopy } from "@/hooks/useTaskNoteCopy";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";

interface TaskNoteRowProps {
  /** 当前笔记；是否选中由右侧面板实际可见状态决定。 */
  note: TaskNoteInput;
  active: boolean;
  /** 归档或写入期间不允许删除，查看入口仍可用。 */
  deleteDisabled: boolean;
  onOpen: (id: string, trigger: HTMLButtonElement) => void;
  /** 仅请求删除确认，不切换预览或丢弃草稿；任务正文不传入此回调。 */
  onDelete?: (id: string) => void;
}
export function TaskNoteRow({ note, active, deleteDisabled, onOpen, onDelete }: TaskNoteRowProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const trigger = useRef<HTMLButtonElement>(null);
  const selectedAction = useRef(false);
  const title = note.title || t("tasks:resources.untitledNote");
  const { copy, copyFailed } = useTaskNoteCopy(note);
  const Icon = note.id === TASK_PROMPT_ID ? FileText : NotebookText;
  function open() { if (trigger.current) onOpen(note.id, trigger.current); }
  return <><ContextMenu onOpenChange={(opened) => { if (opened) selectedAction.current = false; }}>
    <ContextMenuTrigger asChild><button ref={trigger} className="task-context-row" data-active={active} aria-pressed={active} title={title} onClick={open}>
      <span className="task-context-item-icon"><Icon /></span><span className="truncate">{title}</span>
    </button></ContextMenuTrigger>
    <ContextMenuContent className="[&_svg]:size-3.5!" updatePositionStrategy="always" onCloseAutoFocus={(event) => { if (selectedAction.current) event.preventDefault(); }}>
      <ContextMenuItem onSelect={() => { selectedAction.current = true;open(); }}>{t("common:actions.open")}</ContextMenuItem>
      <ContextMenuItem onSelect={() => void copy()}><Copy aria-hidden="true" />{t("tasks:notes.copy")}</ContextMenuItem>
      {onDelete && <><ContextMenuSeparator />
        <ContextMenuItem variant="destructive" disabled={deleteDisabled} onSelect={() => { selectedAction.current = true;onDelete(note.id); }}><Trash2 aria-hidden="true" />{t("common:actions.delete")}</ContextMenuItem>
      </>}
    </ContextMenuContent>
  </ContextMenu>{copyFailed && <p role="alert" className="px-2 text-xs text-destructive">{t("tasks:notes.copyFailed")}</p>}</>;
}
