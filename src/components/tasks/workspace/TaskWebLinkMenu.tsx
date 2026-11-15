import { useState } from "react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import type { AggregatedTaskWebLink } from "@/utils/taskWebLinks";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTaskStore } from "@/stores/taskStore";
import { useTaskResourceUndoStore } from "@/stores/taskResourceUndoStore";
import { getTaskError } from "@/services/taskErrors";
import { TaskResourceMenu } from "./TaskResourceMenu";

interface TaskWebLinkMenuProps {
  task: Task;
  link: AggregatedTaskWebLink;
  children: ReactElement;
  onOpen: () => void;
  archived?: boolean;
}

export function TaskWebLinkMenu({ task, link, children, onOpen, archived = false }: TaskWebLinkMenuProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(link.title);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const pending = useTaskStore((state) => state.pending);
  const readOnly = task.status === "ARCHIVED";

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); } catch { /* 复制失败时保持静默，菜单已关闭。 */ }
  }
  async function archiveOrRestore(restore: boolean) {
    const items = link.ids.map((id) => ({ kind: "link" as const, id }));
    const result = restore
      ? await useTaskStore.getState().restoreResources(task.id, items)
      : await useTaskStore.getState().archiveResources(task.id, items);
    useTaskResourceUndoStore.getState().remember(task.id, result);
  }
  async function saveTitle() {
    if (busy || pending || readOnly) return;
    setBusy(true); setError(null);
    try { await useTaskStore.getState().updateWebLink(task.id, link.id, title); setEditing(false); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }

  const actions = <>
    <ContextMenuItem onSelect={onOpen}>{t("tasks:resources.openLink")}</ContextMenuItem>
    <ContextMenuItem onSelect={() => void copy(link.url)}>{t("tasks:resources.copyUrl")}</ContextMenuItem>
    <ContextMenuItem onSelect={() => void copy(link.title.trim() ? link.title : link.url)}>{t("tasks:resources.copyTitle")}</ContextMenuItem>
    {!readOnly && <ContextMenuItem onSelect={() => { setTitle(link.title); setError(null); setEditing(true); }}>{t("tasks:resources.editTitle")}</ContextMenuItem>}
  </>;

  return <>
    <TaskResourceMenu task={task} resource={{ kind: "link", id: link.id }} ids={link.ids} actions={actions}
      onArchive={readOnly || archived ? undefined : () => void archiveOrRestore(false)}
      onRestore={readOnly || !archived ? undefined : () => void archiveOrRestore(true)}>
      {children}
    </TaskResourceMenu>
    <Dialog open={editing} onOpenChange={(open) => { if (!busy) setEditing(open); }}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{t("tasks:resources.editTitle")}</DialogTitle>
        <Input value={title} maxLength={200} disabled={busy || pending} placeholder={t("tasks:resources.titlePlaceholder")} onChange={(event) => setTitle(event.target.value)} />
        {error !== null && <p role="alert" className="text-xs text-destructive">{getTaskError(error)}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>{t("common:actions.cancel")}</Button>
          <Button size="sm" disabled={busy || pending} onClick={() => void saveTitle()}>{t("common:actions.save")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
