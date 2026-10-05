import { useRef } from "react";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Paperclip } from "lucide-react";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface TaskAttachmentMenuProps {
  /** 任务创建或文件选择期间禁止打开菜单。 */
  disabled: boolean;
  /** 子弹窗关闭时恢复入口焦点。 */
  triggerRef: Ref<HTMLButtonElement>;
  /** 复用已有系统文件选择流程。 */
  onChooseFiles: () => void;
  /** 打开普通链接子弹窗。 */
  onAddLink: () => void;
}

export function TaskAttachmentMenu({ disabled, triggerRef, onChooseFiles, onAddLink }: TaskAttachmentMenuProps) {
  const { t } = useTranslation(["taskCreate"]);
  const openingDialog = useRef(false);
  return <DropdownMenu onOpenChange={(open) => { if (open) openingDialog.current = false; }}>
    <DropdownMenuTrigger asChild>
      <IconTooltip ref={triggerRef} label={t("taskCreate:attachments.menu")} disabled={disabled} size="icon-sm"><Paperclip className="size-3.5" /></IconTooltip>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" side="top" className="min-w-44"
      onCloseAutoFocus={(event) => { if (openingDialog.current) event.preventDefault(); }}>
      <DropdownMenuItem className="text-xs" onSelect={onChooseFiles}><Paperclip className="size-3.5" />{t("taskCreate:attachments.add")}</DropdownMenuItem>
      <DropdownMenuItem className="text-xs" onSelect={() => { openingDialog.current = true; onAddLink(); }}><Link2 className="size-3.5" />{t("taskCreate:webLinks.add")}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
