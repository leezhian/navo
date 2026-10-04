import { useTranslation } from "react-i18next";
import { Link2, Paperclip, X } from "lucide-react";
import type { IssueItem } from "@/domain/issues";
import type { TaskAttachment } from "@/shared/taskTypes";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { IconTooltip } from "@/components/ui/icon-tooltip";

interface TaskComposerProps {
  /** 纯文本任务描述，关联条目和附件不混入文本。 */
  description: string;
  /** 已关联的 Issue 和 PR，在编辑区域内部回显。 */
  links: IssueItem[];
  /** 已选附件，仅回显名称，不展示缩略图和大小。 */
  attachments: TaskAttachment[];
  /** 创建或加载期间禁止编辑与移除。 */
  disabled: boolean;
  /** 由任务表单统一校验描述、目录与提交状态后决定是否可创建。 */
  canCreate: boolean;
  /** 创建期间展示提交中的文案。 */
  creating: boolean;
  /** 发起创建任务，不在输入组件中执行持久化。 */
  onCreate: () => void;
  /** 更新任务描述草稿。 */
  onDescriptionChange: (value: string) => void;
  /** 打开系统文件选择器，支持图片及其他文件。 */
  onChooseFiles: () => void;
  /** 仅移除关联关系，不删除原 Issue 或 PR。 */
  onRemoveLink: (id: string) => void;
  /** 移除草稿附件，不删除用户原文件。 */
  onRemoveAttachment: (id: string) => void;
}

export function TaskComposer({ description, links, attachments, disabled, canCreate, creating, onCreate, onDescriptionChange, onChooseFiles, onRemoveLink, onRemoveAttachment }: TaskComposerProps) {
  const { t } = useTranslation();
  const hasContext = links.length > 0 || attachments.length > 0;

  return <InputGroup className="flex h-auto flex-col items-stretch rounded-xl bg-background shadow-none has-[[data-slot=input-group-control]:focus-visible]:border-input has-[[data-slot=input-group-control]:focus-visible]:ring-0">
    {hasContext && <div className="flex max-h-40 flex-wrap items-start gap-1.5 overflow-y-auto px-3 pt-3 pb-1">
      {links.map((link) => <div key={link.id} className="flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs">
        <span className="shrink-0 text-muted-foreground">{link.group}</span>
        <span className="min-w-0 max-w-64 truncate" title={link.title}>{link.title}</span>
        <Button variant="ghost" size="icon-xs" className="size-5" disabled={disabled} aria-label={t("移除：{{title}}", { title: link.title })} onClick={() => onRemoveLink(link.id)}><X className="size-3" /></Button>
      </div>)}
      {attachments.map((file) => <div key={file.id} className="flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs">
        <Link2 aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
        <span className="min-w-0 max-w-64 truncate" title={file.name}>{file.name}</span>
        <Button variant="ghost" size="icon-xs" className="size-5" disabled={disabled} aria-label={t("移除：{{title}}", { title: file.name })} onClick={() => onRemoveAttachment(file.id)}><X className="size-3" /></Button>
      </div>)}
    </div>}
    <InputGroupTextarea autoFocus rows={1} disabled={disabled} aria-label={t("任务描述")} placeholder={t("描述要完成的任务…")} value={description}
      onChange={(event) => onDescriptionChange(event.target.value)} maxLength={100000}
      className="field-sizing-content min-h-[calc(1lh+1.5rem)] max-h-[calc(8lh+1.5rem)] resize-none overflow-y-auto rounded-xl p-3 text-sm leading-5" />
    <InputGroupAddon align="block-end" className="justify-between px-2 pb-2">
      <IconTooltip label={t("添加图片或文件")} disabled={disabled} size="icon-sm" onClick={onChooseFiles}><Paperclip className="size-3.5" /></IconTooltip>
      <Button type="button" size="sm" disabled={!canCreate} onClick={onCreate}>{t(creating ? "创建中…" : "创建")}</Button>
    </InputGroupAddon>
  </InputGroup>;
}
