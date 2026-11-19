import { File } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TASK_NOTE_CONTENT_LIMIT, TASK_NOTE_TITLE_LIMIT } from "@/utils/taskNotes";
import { isTaskLinkUrl } from "@/utils/taskWebLinks";
import type { Task } from "@/domain/tasks";
import type { TaskResourceCategory } from "@/shared/taskResourceTypes";
import type { useTaskResourceDraft } from "@/hooks/useTaskResourceDraft";
import { TaskIssuePickerContent } from "../create/TaskIssuePickerContent";
import { TaskWebLinkFields } from "../create/TaskWebLinkFields";
import { TaskRepositoryCatalog } from "./TaskRepositoryCatalog";

interface TaskResourceAddFormProps {
  /** 表单只修改此任务当前类别的草稿。 */
  task: Task;
  category: TaskResourceCategory;
  draft: ReturnType<typeof useTaskResourceDraft>;
  disabled: boolean;
  /** 系统目录选择及克隆弹窗期间锁定外层导航。 */
  onPickerBusy: (busy: boolean) => void;
}

export function TaskResourceAddForm({ task, category, draft, disabled, onPickerBusy }: TaskResourceAddFormProps) {
  const { t } = useTranslation(["tasks", "issues"]);
  const issueGroup = category === "pullRequests" ? "PR" : "ISSUE";
  const isIssue = category === "issues" || category === "pullRequests";
  if (category === "repositories") return <TaskRepositoryCatalog task={task} selection={draft.repositorySelection} canSubmit={draft.count === 1} onSubmit={draft.submit} disabled={disabled} onBusyChange={onPickerBusy} />;
  return <>
    {isIssue && <><TaskIssuePickerContent key={category} group={issueGroup} showPreview={false} selected={category === "issues" ? draft.issues : draft.prs} onChange={category === "issues" ? draft.setIssues : draft.setPrs} lockedIds={(task.links ?? []).filter((item) => item.group === issueGroup).map((item) => item.id)} disabled={disabled} />{draft.alreadyArchived && <p className="text-xs text-muted-foreground">{t("tasks:resources.alreadyArchived")}</p>}</>}
    {category === "links" && <div className="space-y-3"><TaskWebLinkFields autoFocus={false} url={draft.url} title={draft.linkTitle} onUrlChange={(value) => { draft.setPreferPlainLink(false); draft.setUrl(value); }} onTitleChange={draft.setLinkTitle} disabled={disabled} invalid={Boolean(draft.url.trim()) && !isTaskLinkUrl(draft.url.trim())} />
      {draft.resolving && <p className="text-xs text-muted-foreground">{t("issues:menu.resolving")}</p>}
      {draft.resolveError && <p role="status" className="text-xs text-muted-foreground">{t(`issues:menu.resolve.${draft.resolveError}` as "issues:menu.resolve.notFound", { defaultValue: t("issues:menu.resolve.unreadable") })}</p>}
      {draft.resolvedIssue && !draft.preferPlainLink && <p className="text-xs text-muted-foreground">{draft.resolvedIssue.group} · {draft.resolvedIssue.title}</p>}
      {(draft.resolvedIssue || draft.resolveError) && <Button type="button" variant="link" className="h-auto px-0 text-xs" disabled={disabled} onClick={() => draft.setPreferPlainLink(true)}>{t("issues:menu.asLink")}</Button>}
      {draft.alreadyArchived && <p className="text-xs text-muted-foreground">{t("tasks:resources.alreadyArchived")}</p>}</div>}
    {category === "notes" && <><Input aria-label={t("tasks:resources.noteTitle")} placeholder={t("tasks:resources.noteTitle")} value={draft.noteTitle} maxLength={TASK_NOTE_TITLE_LIMIT} disabled={disabled} onChange={(event) => draft.setNoteTitle(event.target.value)} className="h-8 text-xs" />
      <Textarea aria-label={t("tasks:resources.noteContent")} placeholder={t("tasks:resources.noteContent")} value={draft.content} maxLength={TASK_NOTE_CONTENT_LIMIT} disabled={disabled} onChange={(event) => draft.setContent(event.target.value)} className="min-h-24 flex-1 resize-y text-xs leading-relaxed" />
    </>}
    {category === "files" && <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-xs">
      <File className="size-8 text-muted-foreground" /><p className="max-w-md leading-6 text-muted-foreground">{t("tasks:resources.fileDescription")}</p>
      {draft.file && <div className="max-w-full"><p className="truncate font-medium">{draft.file.name}</p><p className="mt-1 break-all text-muted-foreground">{draft.file.path}</p></div>}
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => void draft.chooseFile()}>{t(draft.file ? "tasks:resources.changeFile" : "tasks:resources.chooseFile")}</Button>
      {draft.alreadyArchived && <p>{t("tasks:resources.alreadyArchived")}</p>}
    </div>}
  </>;
}
