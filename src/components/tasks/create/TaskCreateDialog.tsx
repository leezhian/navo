import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleDot, GitPullRequest, Plus } from "lucide-react";
import type { AppSettings } from "@/domain/types";
import type { Task } from "@/domain/tasks";
import type { IssueGroup } from "@/domain/issues";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTaskDraft } from "@/hooks/useTaskDraft";
import { useTaskStore } from "@/stores/taskStore";
import { getTaskError } from "@/services/taskErrors";
import { TaskResourceRow } from "./TaskResourceRow";
import { TaskResourcePicker } from "./TaskResourcePicker";
import { TaskIssuePicker } from "./TaskIssuePicker";
import { TaskComposer } from "./TaskComposer";
import { TaskWebLinkDialog } from "./TaskWebLinkDialog";
import { useTaskAgentOptions } from "@/hooks/useTaskAgentOptions";
import { TaskAgentMenu } from "./TaskAgentMenu";

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
  const { t } = useTranslation(["common", "taskCreate"]);
  const draft = useTaskDraft(settings);
  const agents = useTaskAgentOptions(open, draft.agent, draft.setAgent);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const { loaded, pending } = useTaskStore();
  const [issueGroup, setIssueGroup] = useState<IssueGroup | null>(null);
  const [resourcePicker, setResourcePicker] = useState(false);
  const [webLinkDialog, setWebLinkDialog] = useState(false);
  const attachmentTriggerRef = useRef<HTMLButtonElement>(null);
  const pickerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const resourceTriggerRef = useRef<HTMLButtonElement>(null);
  const disabled = draft.working || pending;
  const invalidResources = draft.resources.some((resource) => resource.info.git && resource.mode !== "current-branch" && !resource.sourceBranch);
  const canCreate = !disabled && !agents.busy && !agents.pending && agents.error === null && loaded && Boolean(draft.description.trim()) && !invalidResources;
  async function create() {
    if (!canCreate) return;
    const task = await draft.submit();
    if (task) { onOpenChange(false); onCreated(task); }
  }
  return <>
    <Dialog open={open} onOpenChange={(next) => { if (!disabled && !issueGroup && !resourcePicker && !webLinkDialog && !agentMenuOpen) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-[760px]" showCloseButton={!disabled} aria-describedby={undefined}
        onEscapeKeyDown={(event) => {
          const editingBranch = event.target instanceof HTMLElement && event.target.closest("[data-task-branch-editor]");
          if (disabled || issueGroup || resourcePicker || webLinkDialog || agentMenuOpen || editingBranch) event.preventDefault();
        }}
        onInteractOutside={(event) => { if (disabled || issueGroup || resourcePicker || webLinkDialog || agentMenuOpen) event.preventDefault(); }}>
        <DialogTitle className="sr-only">{t("taskCreate:actions.open")}</DialogTitle>
        <div className="max-h-[65vh] space-y-2 overflow-y-auto p-0.5">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 pr-8">
              <Button variant="secondary" className="h-8 text-xs" disabled={disabled} onClick={(event) => { pickerTriggerRef.current = event.currentTarget; setIssueGroup("ISSUE"); }}><CircleDot className="size-3.5" />{t("taskCreate:links.addIssue")}</Button>
              <Button variant="secondary" className="h-8 text-xs" disabled={disabled} onClick={(event) => { pickerTriggerRef.current = event.currentTarget; setIssueGroup("PR"); }}><GitPullRequest className="size-3.5" />{t("taskCreate:links.addPullRequest")}</Button>
            </div>
            <TaskComposer description={draft.description} links={draft.links} attachments={draft.attachments} disabled={disabled}
              agentControl={<TaskAgentMenu value={draft.agent} options={agents} disabled={disabled} open={agentMenuOpen} onOpenChange={setAgentMenuOpen} onChange={draft.setAgent} />}
              webLinks={draft.webLinks} attachmentTriggerRef={attachmentTriggerRef} onAddWebLink={() => setWebLinkDialog(true)}
              onRemoveWebLink={(id) => draft.setWebLinks((current) => current.filter((link) => link.id !== id))}
              canCreate={canCreate} creating={draft.working} onCreate={() => void create()}
              onDescriptionChange={draft.setDescription}
              onChooseFiles={() => void draft.chooseFiles()}
              onRemoveLink={(id) => draft.setLinks((current) => current.filter((item) => item.id !== id))}
              onRemoveAttachment={draft.removeAttachment} />
          </div>
          <section>
            {draft.resources.length === 0
              ? <Button ref={resourceTriggerRef} variant="ghost" className="h-8 text-xs" aria-label={t("taskCreate:resources.add")} disabled={disabled} onClick={() => setResourcePicker(true)}><Plus className="size-3.5" />{t("taskCreate:resources.add")}</Button>
              : <div className="max-h-64 space-y-1 overflow-auto overscroll-contain p-0.5">
                {draft.resources.map((resource, index) => <div key={resource.draftId} className="flex w-max items-center gap-2">
                  <TaskResourceRow value={resource} disabled={disabled}
                    excludedIds={draft.resources.filter((item) => item.mode === "folder" && item.draftId !== resource.draftId).map((item) => item.resourceId)}
                    onChange={(next) => draft.setResources((current) => current.map((item) => item.draftId === resource.draftId ? next : item))}
                    onReplace={(id) => draft.addResources([id], resource.draftId)}
                    onRemove={() => draft.setResources((current) => current.filter((item) => item.draftId !== resource.draftId))} />
                  {index === draft.resources.length - 1 && <IconTooltip ref={resourceTriggerRef} label={t("taskCreate:resources.add")} disabled={disabled} variant="secondary" size="icon" onClick={() => setResourcePicker(true)}><Plus className="size-3.5" /></IconTooltip>}
                </div>)}
              </div>}
          </section>
          {draft.error !== null && <p role="alert" className="text-xs leading-5 text-destructive">{getTaskError(draft.error)}</p>}
        </div>
        {/* 子弹窗属于父内容的 React 子树，避免 Portal 内点击在子层卸载后被父层视为外部点击。 */}
        {issueGroup && <TaskIssuePicker group={issueGroup} selected={draft.links} onReturnFocus={() => pickerTriggerRef.current?.focus()} onClose={() => setIssueGroup(null)} onConfirm={(items) => {
          draft.setLinks((current) => [...current.filter((item) => item.group !== issueGroup), ...items]); setIssueGroup(null);
        }} />}
        {resourcePicker && <TaskResourcePicker repositoriesDirectory={settings.repositoriesDirectory}
          defaultTaskMode={settings.defaultTaskMode}
          onReturnFocus={() => resourceTriggerRef.current?.focus()}
          excludedIds={draft.resources.filter((resource) => resource.mode === "folder").map((resource) => resource.resourceId)} addedResources={draft.resources}
          onClose={() => setResourcePicker(false)} onConfirm={draft.addSelectedResources} />}
        {webLinkDialog && <TaskWebLinkDialog onReturnFocus={() => attachmentTriggerRef.current?.focus()}
          onClose={() => setWebLinkDialog(false)} onConfirm={(link) => {
            draft.setWebLinks((current) => [...current, link]); setWebLinkDialog(false);
          }} />}
      </DialogContent>
    </Dialog>
  </>;
}
