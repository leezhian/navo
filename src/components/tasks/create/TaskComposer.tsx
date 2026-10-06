import { useTranslation } from "react-i18next";
import { Link2, X } from "lucide-react";
import type { ReactNode, Ref } from "react";
import type { IssueItem } from "@/domain/issues";
import type { TaskAttachment, TaskWebLink } from "@/shared/taskTypes";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { TaskAttachmentMenu } from "./TaskAttachmentMenu";

interface TaskComposerProps {
  /** 创建按钮左侧的独立 Agent 入口，图标及配置回显整体可点击。 */
  agentControl: ReactNode;
  /** 纯文本任务描述，关联条目和附件不混入文本。 */
  description: string;
  /** 已关联的 Issue 和 PR，在编辑区域内部回显。 */
  links: IssueItem[];
  /** 已选附件，仅回显名称，不展示缩略图和大小。 */
  attachments: TaskAttachment[];
  /** 普通链接仅回显标题或 URL，不混入 Issue/PR 关联。 */
  webLinks: TaskWebLink[];
  /** 添加链接弹窗关闭后的焦点恢复位置。 */
  attachmentTriggerRef: Ref<HTMLButtonElement>;
  /** 打开普通链接子弹窗。 */
  onAddWebLink: () => void;
  /** 仅移除当前草稿中的普通链接。 */
  onRemoveWebLink: (id: string) => void;
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

export function TaskComposer({ agentControl, description, links, attachments, webLinks, attachmentTriggerRef, onAddWebLink, onRemoveWebLink, disabled, canCreate, creating, onCreate, onDescriptionChange, onChooseFiles, onRemoveLink, onRemoveAttachment }: TaskComposerProps) {
  const { t } = useTranslation(["common", "taskCreate"]);
  const hasContext = links.length > 0 || attachments.length > 0 || webLinks.length > 0;

  return <InputGroup className="flex h-auto flex-col items-stretch rounded-xl bg-background shadow-none has-[[data-slot=input-group-control]:focus-visible]:border-input has-[[data-slot=input-group-control]:focus-visible]:ring-0">
    {hasContext && <div className="flex max-h-40 flex-wrap items-start gap-1.5 overflow-y-auto px-3 pt-3 pb-1">
      {links.map((link) => <div key={link.id} className="flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs">
        <span className="shrink-0 text-muted-foreground">{link.group}</span>
        <span className="min-w-0 max-w-64 truncate" title={link.title}>{link.title}</span>
        <Button variant="ghost" size="icon-xs" className="size-5" disabled={disabled} aria-label={t("common:selection.removeItem", { title: link.title })} onClick={() => onRemoveLink(link.id)}><X className="size-3" /></Button>
      </div>)}
      {webLinks.map((link) => <div key={link.id} className="flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs">
        <Link2 aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
        <span className="min-w-0 max-w-64 truncate" title={link.url}>{link.title || link.url}</span>
        <Button variant="ghost" size="icon-xs" className="size-5" disabled={disabled} aria-label={t("common:selection.removeItem", { title: link.title || link.url })} onClick={() => onRemoveWebLink(link.id)}><X className="size-3" /></Button>
      </div>)}
      {attachments.map((file) => <div key={file.id} className="flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs">
        <Link2 aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
        <span className="min-w-0 max-w-64 truncate" title={file.name}>{file.name}</span>
        <Button variant="ghost" size="icon-xs" className="size-5" disabled={disabled} aria-label={t("common:selection.removeItem", { title: file.name })} onClick={() => onRemoveAttachment(file.id)}><X className="size-3" /></Button>
      </div>)}
    </div>}
    <InputGroupTextarea autoFocus rows={1} disabled={disabled} aria-label={t("taskCreate:composer.description")} placeholder={t("taskCreate:composer.placeholder")} value={description}
      onChange={(event) => onDescriptionChange(event.target.value)} maxLength={100000}
      className="field-sizing-content min-h-[calc(1lh+1.5rem)] max-h-[calc(8lh+1.5rem)] resize-none overflow-y-auto rounded-xl p-3 text-sm leading-5" />
    <InputGroupAddon align="block-end" className="justify-between px-2 pb-2">
      <TaskAttachmentMenu disabled={disabled} triggerRef={attachmentTriggerRef} onChooseFiles={onChooseFiles} onAddLink={onAddWebLink} />
      <div className="flex min-w-0 items-center gap-2">{agentControl}<Button type="button" size="sm" disabled={!canCreate} onClick={onCreate}>{t(creating ? "taskCreate:actions.creating" : "common:actions.create")}</Button></div>
    </InputGroupAddon>
  </InputGroup>;
}
