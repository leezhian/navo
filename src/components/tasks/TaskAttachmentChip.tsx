import { File, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskAttachment } from "@/shared/taskTypes";
import { Button } from "@/components/ui/button";

interface TaskAttachmentChipProps {
  /** 元信息与可选缩略图；图片来源为受控本地文件选择或附件副本。 */
  attachment: TaskAttachment;
  /** 未传入时只读展示。 */
  onRemove?: () => void;
  /** 提交期间禁用移除。 */
  disabled?: boolean;
}

export function TaskAttachmentChip({ attachment, onRemove, disabled }: TaskAttachmentChipProps) {
  const { t } = useTranslation();
  const size = attachment.size < 1024 * 1024 ? Math.ceil(attachment.size / 1024) + " KB" : (attachment.size / (1024 * 1024)).toFixed(1) + " MB";
  return <div className="flex max-w-full items-center gap-2 rounded-lg border px-2 py-2">
    {attachment.preview ? <img src={attachment.preview} alt="" className="h-8 w-10 rounded object-cover" /> : <File aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
    <div className="min-w-0"><p className="max-w-40 truncate text-xs" title={attachment.name}>{attachment.name}</p><p className="text-[11px] text-muted-foreground">{size}</p></div>
    {onRemove && <Button variant="ghost" size="icon-xs" disabled={disabled} aria-label={t("移除：{{title}}", { title: attachment.name })} onClick={onRemove}><X className="size-3" /></Button>}
  </div>;
}
