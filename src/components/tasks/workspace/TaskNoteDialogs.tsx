import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TaskNoteEditor } from "@/hooks/useTaskNoteEditor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getTaskError } from "@/services/taskErrors";

interface TaskNoteDialogsProps {
  /** 删除和放弃草稿均需显式确认；取消或 Esc 不关闭底层笔记面板。 */
  editor: TaskNoteEditor;
}

export function TaskNoteDialogs({ editor }: TaskNoteDialogsProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const deleting = editor.confirmation?.kind === "delete";
  return <Dialog open={Boolean(editor.confirmation)} onOpenChange={(open) => { if (!open) editor.cancelConfirmation(); }}>
    <DialogContent showCloseButton={false} onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus(); }} onInteractOutside={(event) => event.preventDefault()}>
      <DialogTitle>{t(deleting ? "tasks:notes.deleteTitle" : "tasks:notes.discardTitle")}</DialogTitle>
      <DialogDescription>{deleting ? t("tasks:notes.deleteDescription", { title: editor.deletionNote?.title || t("tasks:resources.untitledNote") }) : t("tasks:notes.discardDescription")}</DialogDescription>
      {deleting && editor.error !== null && <p role="alert" className="text-xs text-destructive">{getTaskError(editor.error)}</p>}
      <div className="flex justify-end gap-2">
        <Button ref={cancelRef} variant="ghost" size="sm" disabled={editor.busy} onClick={editor.cancelConfirmation}>{t("common:actions.cancel")}</Button>
        <Button variant="destructive" size="sm" disabled={editor.busy || (deleting && (editor.pending || editor.readOnly))} onClick={() => void editor.confirm()}>{t(deleting ? "common:actions.delete" : "tasks:notes.discard")}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
