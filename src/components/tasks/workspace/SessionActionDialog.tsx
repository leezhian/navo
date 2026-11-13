import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";

export type SessionDialogAction = "rename" | "delete";
interface SessionActionDialogProps {
  /** 固定操作对象；右击其他会话不改变当前显示的 Agent。 */
  session: TaskSession;
  /** 每次打开时挂载，名称草稿与错误反馈不沿用上一次操作。 */
  action: SessionDialogAction;
  onClose: () => void;
}

export function SessionActionDialog({ session, action, onClose }: SessionActionDialogProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const pending = useTaskSessionStore((state) => state.pending);
  const [title, setTitle] = useState(session.title);
  const [failed, setFailed] = useState(false);
  const sessionName = session.title || t("tasks:runtime.untitledSession");
  async function confirm() {
    const store = useTaskSessionStore.getState();
    if (store.pending || (action === "rename" && !title.trim())) return;
    setFailed(false);
    if (action === "rename") await store.rename(session.id, title);
    else await store.remove(session.id);
    if (useTaskSessionStore.getState().error) setFailed(true);
    else onClose();
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <DialogContent className="sm:max-w-md" showCloseButton={!pending} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onInteractOutside={(event) => { if (pending) event.preventDefault(); }}>
      <DialogTitle>{t(action === "rename" ? "tasks:runtime.renameSession" : "tasks:runtime.deleteSession")}</DialogTitle>
      <DialogDescription>{action === "rename" ? t("tasks:runtime.renameNativeDescription") : t("tasks:runtime.deleteNativeDescription", { name: sessionName })}</DialogDescription>
      {action === "rename" && <Input autoFocus aria-label={t("tasks:runtime.sessionName")} maxLength={160} value={title} disabled={pending} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) void confirm(); }} />}
      {failed && <p role="alert" className="text-xs text-destructive">{t("tasks:runtime.nativeActionFailed")}</p>}
      <DialogFooter>
        <Button variant="ghost" autoFocus={action === "delete"} disabled={pending} onClick={onClose}>{t("common:actions.cancel")}</Button>
        <Button variant={action === "delete" ? "destructive" : "default"} disabled={pending || (action === "rename" && !title.trim())} onClick={() => void confirm()}>{t(action === "delete" ? "common:actions.delete" : "common:actions.confirm")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
