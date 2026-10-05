import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { TaskWebLink } from "@/shared/taskTypes";
import { isTaskLinkUrl, TASK_LINK_TITLE_MAX_LENGTH, TASK_LINK_URL_MAX_LENGTH } from "@/utils/taskWebLinks";

interface TaskWebLinkDialogProps {
  /** 确认后将普通链接加入任务草稿，不触发远端抓取或 Issue/PR 关联。 */
  onConfirm: (link: TaskWebLink) => void;
  /** 取消只丢弃本层输入，不关闭或清空创建任务表单。 */
  onClose: () => void;
  /** 关闭后将焦点恢复到创建表单的附件入口。 */
  onReturnFocus: () => void;
}

export function TaskWebLinkDialog({ onConfirm, onClose, onReturnFocus }: TaskWebLinkDialogProps) {
  const { t } = useTranslation(["taskCreate", "common"]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [invalid, setInvalid] = useState(false);
  const descriptionId = useId();
  const errorId = useId();

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-md" aria-describedby={descriptionId}
      onCloseAutoFocus={(event) => { event.preventDefault(); onReturnFocus(); }}>
      <DialogTitle>{t("taskCreate:webLinks.add")}</DialogTitle>
      <form className="space-y-3" noValidate onSubmit={(event) => {
        event.preventDefault();
        const trimmedUrl = url.trim();
        if (!isTaskLinkUrl(trimmedUrl)) { setInvalid(true); return; }
        onConfirm({ id: crypto.randomUUID(), url: trimmedUrl, title: title.trim() });
      }}>
        <label className="grid gap-1.5 text-xs">
          {t("taskCreate:webLinks.url")}
          <Input autoFocus required type="url" value={url} maxLength={TASK_LINK_URL_MAX_LENGTH} placeholder="https://"
            aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined}
            className="h-8 text-xs" onChange={(event) => { setUrl(event.target.value); setInvalid(false); }} />
        </label>
        <label className="grid gap-1.5 text-xs">
          {t("common:fields.title")}
          <Input value={title} placeholder={t("taskCreate:webLinks.titlePlaceholder")} maxLength={TASK_LINK_TITLE_MAX_LENGTH} className="h-8 text-xs" onChange={(event) => setTitle(event.target.value)} />
        </label>
        {invalid && <p id={errorId} role="alert" className="text-xs text-destructive">{t("taskCreate:webLinks.invalidUrl")}</p>}
        <DialogDescription id={descriptionId} className="text-xs leading-5">{t("taskCreate:webLinks.description")}</DialogDescription>
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!url.trim()}>{t("common:actions.add")}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
