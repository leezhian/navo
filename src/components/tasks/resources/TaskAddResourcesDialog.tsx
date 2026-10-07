import { useState } from "react";
import { CircleDot, File, FolderGit2, GitPullRequest, Link2, NotebookPen } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import type { TaskResourceCategory } from "@/shared/taskResourceTypes";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskIssuePickerContent } from "../create/TaskIssuePickerContent";
import { TaskWebLinkFields } from "../create/TaskWebLinkFields";
import { useTaskResourceDraft } from "@/hooks/useTaskResourceDraft";
import { getTaskError } from "@/services/taskErrors";
import { useTaskStore } from "@/stores/taskStore";
import { isTaskLinkUrl } from "@/utils/taskWebLinks";

const categories = [
  { id: "repositories", icon: FolderGit2 }, { id: "issues", icon: CircleDot }, { id: "pullRequests", icon: GitPullRequest },
  { id: "notes", icon: NotebookPen }, { id: "links", icon: Link2 }, { id: "files", icon: File },
] as const;

interface TaskAddResourcesDialogProps {
  /** 保存成功更新已有任务，不创建任务或启动 Agent。 */
  task: Task;
  /** 顶部入口默认仓库页，分类加号直接定位对应页。 */
  initialCategory: TaskResourceCategory;
  onClose: () => void;
}
export function TaskAddResourcesDialog({ task, initialCategory, onClose }: TaskAddResourcesDialogProps) {
  const { t } = useTranslation(["tasks", "common", "taskCreate"]);
  const [category, setCategory] = useState(initialCategory);
  const updatedTask = useTaskStore((state) => state.tasks.find((item) => item.id === task.id)) ?? task;
  const draft = useTaskResourceDraft(updatedTask, category);
  const pending = useTaskStore((state) => state.pending);
  const disabled = draft.busy || pending;
  const issueGroup = category === "pullRequests" ? "PR" : "ISSUE";
  const isIssue = category === "issues" || category === "pullRequests";
  async function add(close: boolean) { if (await draft.submit() && close) onClose(); }
  return <Dialog open onOpenChange={(open) => { if (!open && !disabled) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] w-[calc(100%-32px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1000px]" aria-describedby={undefined} showCloseButton={!disabled}
      onEscapeKeyDown={(event) => { if (disabled) event.preventDefault(); }} onInteractOutside={(event) => { if (disabled) event.preventDefault(); }}>
      <div className="px-5 py-4"><DialogTitle>{t("tasks:resources.title")}</DialogTitle></div>
      <div className="flex min-h-0 flex-col sm:flex-row">
        <nav aria-label={t("tasks:resources.categories")} className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 sm:w-44 sm:flex-col sm:border-r sm:border-b-0">
          {categories.map(({ id, icon: Icon }) => <Button key={id} variant="ghost" size="sm" disabled={disabled} aria-current={category === id ? "page" : undefined} className="shrink-0 justify-start gap-2 text-xs aria-[current=page]:bg-muted" onClick={() => setCategory(id)}>
            <Icon className="size-3.5" />{t(`tasks:resources.category.${id}`)}
          </Button>)}
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-auto p-4 sm:min-h-[440px]" data-resource-category={category}>
          {category === "repositories" && <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-xs text-muted-foreground"><FolderGit2 className="size-7" /><p>{t("tasks:resources.repositoriesPending")}</p></div>}
          {isIssue && <TaskIssuePickerContent key={category} group={issueGroup} selected={category === "issues" ? draft.issues : draft.prs} onChange={category === "issues" ? draft.setIssues : draft.setPrs} lockedIds={(updatedTask.links ?? []).filter((item) => item.group === issueGroup).map((item) => item.id)} disabled={disabled} />}
          {category === "links" && <div className="space-y-3"><TaskWebLinkFields url={draft.url} title={draft.linkTitle} onUrlChange={draft.setUrl} onTitleChange={draft.setLinkTitle} disabled={disabled} invalid={Boolean(draft.url.trim()) && !isTaskLinkUrl(draft.url.trim())} />{draft.duplicateLink && <p className="text-xs text-muted-foreground">{t("tasks:resources.alreadyLinked")}</p>}</div>}
          {category === "notes" && <><Input aria-label={t("tasks:resources.noteTitle")} placeholder={t("tasks:resources.noteTitle")} value={draft.noteTitle} maxLength={160} disabled={disabled} onChange={(event) => draft.setNoteTitle(event.target.value)} className="h-8 text-xs" />
            <textarea aria-label={t("tasks:resources.noteContent")} placeholder={t("tasks:resources.noteContent")} value={draft.content} maxLength={100000} disabled={disabled} onChange={(event) => draft.setContent(event.target.value)} className="min-h-56 flex-1 resize-none rounded-lg border border-input bg-transparent p-3 font-mono text-xs leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
          </>}
          {category === "files" && <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-xs">
            <File className="size-8 text-muted-foreground" /><p className="max-w-md leading-6 text-muted-foreground">{t("tasks:resources.fileDescription")}</p>
            {draft.file && <div className="max-w-full"><p className="truncate font-medium">{draft.file.name}</p><p className="mt-1 break-all text-muted-foreground">{draft.file.path}</p></div>}
            <Button variant="secondary" size="sm" disabled={disabled} onClick={() => void draft.chooseFile()}>{t(draft.file ? "tasks:resources.changeFile" : "tasks:resources.chooseFile")}</Button>
            {draft.duplicateFile && <p className="text-muted-foreground">{t("tasks:resources.alreadyLinked")}</p>}
          </div>}
          {draft.error !== null && <p role="alert" className="text-xs text-destructive">{getTaskError(draft.error)}</p>}
        </div>
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
        <span role="status" className="mr-auto text-xs text-muted-foreground">{draft.added ? t("tasks:resources.added") : t("common:selection.count", { count: draft.count })}</span>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onClose}>{t("common:actions.cancel")}</Button>
        <Button variant="outline" size="sm" disabled={disabled || !draft.count} onClick={() => void add(false)}>{t("tasks:resources.keepAdding")}</Button>
        <Button size="sm" disabled={disabled || !draft.count} onClick={() => void add(true)}>{t("tasks:resources.addToTask")}</Button>
      </footer>
    </DialogContent>
  </Dialog>;
}
