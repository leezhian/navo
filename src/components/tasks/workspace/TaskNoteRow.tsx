import { useRef } from "react";
import { NotebookText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskNote } from "@/shared/taskResourceTypes";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";

interface TaskNoteRowProps {
  /** 当前笔记；是否选中由右侧面板实际可见状态决定。 */
  note: TaskNote;
  active: boolean;
  /** 归档或写入期间不允许删除，查看入口仍可用。 */
  deleteDisabled: boolean;
  onOpen: (id: string, trigger: HTMLButtonElement) => void;
  /** 仅请求删除确认，不在右击时切换当前预览或丢弃另一条笔记的草稿。 */
  onDelete: (id: string) => void;
}
export function TaskNoteRow({ note, active, deleteDisabled, onOpen, onDelete }: TaskNoteRowProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const trigger = useRef<HTMLButtonElement>(null);
  const selectedAction = useRef(false);
  const title = note.title || t("tasks:resources.untitledNote");
  function open() { if (trigger.current) onOpen(note.id, trigger.current); }
  return <ContextMenu onOpenChange={(opened) => { if (opened) selectedAction.current = false; }}>
    <ContextMenuTrigger asChild><button ref={trigger} className="task-context-row" data-active={active} aria-pressed={active} title={title} onClick={open}>
      <span className="task-context-item-icon"><NotebookText /></span><span className="truncate">{title}</span>
    </button></ContextMenuTrigger>
    <ContextMenuContent updatePositionStrategy="always" onCloseAutoFocus={(event) => { if (selectedAction.current) event.preventDefault(); }}>
      <ContextMenuItem onSelect={() => { selectedAction.current = true;open(); }}>{t("common:actions.open")}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" disabled={deleteDisabled} onSelect={() => { selectedAction.current = true;onDelete(note.id); }}>{t("common:actions.delete")}</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>;
}
