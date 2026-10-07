import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { TaskWebLinkFields } from "./TaskWebLinkFields";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { TaskWebLink } from "@/shared/taskTypes";
import { isTaskLinkUrl } from "@/utils/taskWebLinks";

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
        <TaskWebLinkFields url={url} title={title} onUrlChange={(value) => { setUrl(value); setInvalid(false); }} onTitleChange={setTitle} invalid={invalid} errorId={errorId} descriptionId={descriptionId} />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!url.trim()}>{t("common:actions.add")}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
