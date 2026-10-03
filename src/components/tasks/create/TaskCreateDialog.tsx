import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleDot, GitPullRequest, Paperclip, Plus, X } from "lucide-react";
import type { AppSettings } from "@/domain/types";
import type { Task } from "@/domain/tasks";
import type { IssueGroup } from "@/domain/issues";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTaskDraft } from "@/hooks/useTaskDraft";
import { useTaskStore } from "@/stores/taskStore";
import { getTaskError } from "@/services/taskErrors";
import { TaskResourceRow } from "./TaskResourceRow";
import { TaskResourcePicker } from "./TaskResourcePicker";
import { TaskIssuePicker } from "./TaskIssuePicker";
import { TaskAttachmentChip } from "../TaskAttachmentChip";

interface TaskCreateDialogProps {
  /** 弹窗关闭后保留本次窗口内草稿，创建成功后清空。 */
  open: boolean;
  /** 目录、分支前缀和默认任务模式来自全局设置。 */
  settings: AppSettings;
  /** 保存过程中不允许关闭。 */
  onOpenChange: (open: boolean) => void;
  /** 成功后转到 Tasks 并请求查看任务，不创建真实顶部标签。 */
  onCreated: (task: Task) => void;
}

export function TaskCreateDialog({ open, settings, onOpenChange, onCreated }: TaskCreateDialogProps) {
  const { t } = useTranslation();
  const draft = useTaskDraft(settings);
  const { loaded, pending } = useTaskStore();
  const [issueGroup, setIssueGroup] = useState<IssueGroup | null>(null);
  const [resourcePicker, setResourcePicker] = useState(false);
  const disabled = draft.working || pending;
  const invalidResources = draft.resources.some((resource) => resource.info.git && resource.mode !== "current-branch" && !resource.sourceBranch);
  async function create() {
    if (disabled || !loaded) return;
    const task = await draft.submit();
    if (task) { onOpenChange(false); onCreated(task); }
  }
  return <>
    <Dialog open={open && !issueGroup && !resourcePicker} onOpenChange={(next) => { if (!disabled && !issueGroup && !resourcePicker) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-[760px]" showCloseButton={!disabled} aria-describedby={undefined}
        onEscapeKeyDown={(event) => { if (disabled || issueGroup || resourcePicker) event.preventDefault(); }}
        onInteractOutside={(event) => { if (disabled || issueGroup || resourcePicker) event.preventDefault(); }}>
        <DialogHeader><DialogTitle>{t("创建任务")}</DialogTitle></DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-0.5">
          <textarea autoFocus disabled={disabled} aria-label={t("任务描述")} placeholder={t("描述要完成的任务…")} value={draft.description}
            onChange={(event) => draft.setDescription(event.target.value)} maxLength={100000}
            className="min-h-32 w-full resize-y rounded-xl border bg-background p-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50" />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="h-8 text-xs" disabled={disabled} onClick={() => setIssueGroup("ISSUE")}><CircleDot className="size-3.5" />{t("关联 Issue")}</Button>
            <Button variant="secondary" className="h-8 text-xs" disabled={disabled} onClick={() => setIssueGroup("PR")}><GitPullRequest className="size-3.5" />{t("关联 PR")}</Button>
            <Button variant="ghost" className="h-8 text-xs" disabled={disabled} onClick={() => void draft.chooseFiles()}><Paperclip className="size-3.5" />{t("添加图片或文件")}</Button>
          </div>
          {draft.links.length > 0 && <div className="flex flex-wrap gap-2">
            {draft.links.map((link) => <div key={link.id} className="flex max-w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-xs">
              <span className="shrink-0 text-muted-foreground">{link.group}</span><span className="max-w-64 truncate" title={link.title}>{link.title}</span>
              <Button variant="ghost" size="icon-xs" disabled={disabled} aria-label={t("移除：{{title}}", { title: link.title })} onClick={() => draft.setLinks((current) => current.filter((item) => item.id !== link.id))}><X className="size-3" /></Button>
            </div>)}
          </div>}
          {draft.attachments.length > 0 && <div className="flex flex-wrap gap-2">{draft.attachments.map((file) => <TaskAttachmentChip key={file.id} attachment={file} disabled={disabled} onRemove={() => draft.removeAttachment(file.id)} />)}</div>}
          <section className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-medium">{t("工作目录")}</h3><Button variant="ghost" className="h-8 text-xs" disabled={disabled} onClick={() => setResourcePicker(true)}><Plus className="size-3.5" />{t("添加仓库或文件夹")}</Button></div>
            {draft.resources.length > 0 && <div className="max-h-64 space-y-1 overflow-auto overscroll-contain p-0.5">
            {draft.resources.map((resource) => <TaskResourceRow key={resource.resourceId} value={resource} branchPrefix={settings.branchPrefix} disabled={disabled}
              excludedIds={draft.resources.filter((item) => item.resourceId !== resource.resourceId).map((item) => item.resourceId)}
              onChange={(next) => draft.setResources((current) => current.map((item) => item.resourceId === resource.resourceId ? next : item))}
              onReplace={(id) => draft.addResources([id], resource.resourceId)}
              onRemove={() => draft.setResources((current) => current.filter((item) => item.resourceId !== resource.resourceId))} />)}
            </div>}
            {draft.resources.length === 0 && <p className="text-xs text-muted-foreground">{t("可选：关联工作目录，或直接创建任务。")}</p>}
          </section>
          {draft.error !== null && <p role="alert" className="text-xs leading-5 text-destructive">{getTaskError(draft.error)}</p>}
        </div>
        <DialogFooter><Button disabled={disabled || !loaded || !draft.description.trim() || invalidResources} onClick={() => void create()}>{t(draft.working ? "创建中…" : "创建任务")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    {open && issueGroup && <TaskIssuePicker group={issueGroup} selected={draft.links} onClose={() => setIssueGroup(null)} onConfirm={(items) => {
      draft.setLinks((current) => [...current.filter((item) => item.group !== issueGroup), ...items]); setIssueGroup(null);
    }} />}
    {open && resourcePicker && <TaskResourcePicker repositoriesDirectory={settings.repositoriesDirectory}
      excludedIds={draft.resources.map((resource) => resource.resourceId)}
      onClose={() => setResourcePicker(false)} onConfirm={(ids) => draft.addResources(ids)} />}
  </>;
}
