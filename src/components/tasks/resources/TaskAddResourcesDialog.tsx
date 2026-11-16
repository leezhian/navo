import { useEffect, useMemo, useState } from "react";
import { CircleDot, File, FolderGit2, GitPullRequest, Link2, NotebookText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskMarkdownEditor } from "../workspace/TaskMarkdownEditor";
import type { Task } from "@/domain/tasks";
import type { TaskResourceCategory } from "@/shared/taskResourceTypes";
import type { TaskResourceCleanupPlan, TaskResourceRef } from "@/shared/taskResourceLifecycle";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskIssuePickerContent } from "../create/TaskIssuePickerContent";
import { TaskWebLinkFields } from "../create/TaskWebLinkFields";
import { useTaskResourceDraft } from "@/hooks/useTaskResourceDraft";
import { getTaskError } from "@/services/taskErrors";
import { getTasksApi } from "@/services/taskApi";
import { useTaskStore } from "@/stores/taskStore";
import { useTaskResourceUndoStore } from "@/stores/taskResourceUndoStore";
import { isTaskLinkUrl } from "@/utils/taskWebLinks";
import { TaskResourcePickerContent } from "../create/TaskResourcePickerContent";
import { useSettingsStore } from "@/stores/settingsStore";
import { TaskResourceBatchConfirmDialog } from "./TaskResourceBatchConfirmDialog";
import { TaskResourceCleanupDialog } from "./TaskResourceCleanupDialog";
import { TaskResourceUndoBar } from "../workspace/TaskResourceUndoBar";
import { collectCategoryItems, TaskResourceManageList, toResourceRefs, type TaskManagedListItem } from "./TaskResourceManageList";

const categories = [
  { id: "repositories", icon: FolderGit2 }, { id: "issues", icon: CircleDot }, { id: "pullRequests", icon: GitPullRequest },
  { id: "notes", icon: NotebookText }, { id: "links", icon: Link2 }, { id: "files", icon: File },
] as const;

interface TaskAddResourcesDialogProps {
  /** 保存成功更新已有任务，不创建任务或启动 Agent。 */
  task: Task;
  /** 顶部入口默认仓库页，分类加号直接定位对应页。 */
  initialCategory: TaskResourceCategory;
  onClose: () => void;
  /** 打开已有文件或附件的只读预览，由工作台关闭本窗口后展示右侧栏。 */
  onOpenFile?: (kind: "file" | "attachment", id: string) => void;
  onOpenNote?: (id: string) => void;
  onOpenLink?: (id: string) => void;
  onOpenRepository?: (resourceId: string) => void;
  onPreview?: (title: string, body: string) => void;
}

export function TaskAddResourcesDialog({
  task, initialCategory, onClose, onOpenFile, onOpenNote, onOpenLink, onOpenRepository, onPreview,
}: TaskAddResourcesDialogProps) {
  const { t } = useTranslation(["tasks", "common", "taskCreate", "issues"]);
  const [category, setCategory] = useState(initialCategory);
  const [addingRepository, setAddingRepository] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupPlan, setCleanupPlan] = useState<TaskResourceCleanupPlan | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [batchConfirm, setBatchConfirm] = useState<"detach" | "delete" | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const repositoriesDirectory = useSettingsStore((state) => state.settings.repositoriesDirectory);
  const updatedTask = useTaskStore((state) => state.tasks.find((item) => item.id === task.id)) ?? task;
  const draft = useTaskResourceDraft(updatedTask, category);
  const pending = useTaskStore((state) => state.pending);
  const readOnly = updatedTask.status === "ARCHIVED";
  const disabled = draft.busy || pending || addingRepository || readOnly;
  const issueGroup = category === "pullRequests" ? "PR" : "ISSUE";
  const isIssue = category === "issues" || category === "pullRequests";
  const { active } = collectCategoryItems(updatedTask, category);
  const selectedItems = useMemo(() => active.filter((item) => selected.has(`${item.kind}:${item.id}`)), [active, selected]);

  useEffect(() => { setSelected(new Set()); setArchivedOpen(false); setActionError(null); }, [category]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const inspect = getTasksApi().inspectResourceCleanup;
        const plan = inspect ? await inspect(updatedTask.id) : { missingFiles: [], mergedPullRequests: [] };
        if (!cancelled) setCleanupPlan(plan);
      } catch { if (!cancelled) setCleanupPlan({ missingFiles: [], mergedPullRequests: [] }); }
    })();
    return () => { cancelled = true; };
  }, [updatedTask.id, updatedTask.contextVersion, updatedTask.updatedAt]);

  async function add(close: boolean) { if (await draft.submit() && close) onClose(); }
  async function runBatch(operation: () => Promise<import("@/shared/taskResourceLifecycle").TaskResourceBatchResult>) {
    if (readOnly || pending) return;
    setActionError(null);
    try {
      const result = await operation();
      useTaskResourceUndoStore.getState().remember(updatedTask.id, result);
      setSelected(new Set());
    } catch (failure) { setActionError(failure); }
  }
  function openItem(item: TaskManagedListItem) {
    if (item.kind === "file" || item.kind === "attachment") { onOpenFile?.(item.kind, item.id); return; }
    if (item.kind === "note") {
      const archived = (updatedTask.archivedNotes ?? []).find((note) => note.id === item.id);
      if (archived) { onPreview?.(archived.title || t("tasks:resources.untitledNote"), archived.content); return; }
      onOpenNote?.(item.id); return;
    }
    if (item.kind === "link") { onOpenLink?.(item.id); return; }
    if (item.kind === "workspace") { onOpenRepository?.(item.id); return; }
    if (item.kind === "issue") onPreview?.(item.title, item.detail ?? "");
  }

  const cleanupEmpty = !cleanupPlan || (cleanupPlan.missingFiles.length === 0 && cleanupPlan.mergedPullRequests.length === 0);
  const canArchive = selectedItems.some((item) => item.archivable);
  const canDetach = selectedItems.some((item) => item.detachable);
  const canDelete = selectedItems.some((item) => item.deletable);

  return <Dialog open onOpenChange={(open) => { if (!open && !disabled) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] w-[calc(100%-32px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1000px]" aria-describedby={undefined} showCloseButton={!disabled}
      onEscapeKeyDown={(event) => { if (disabled) event.preventDefault(); }} onInteractOutside={(event) => { if (disabled) event.preventDefault(); }}>
      <div className="flex items-center gap-2 py-4 pr-12 pl-5">
        <DialogTitle className="min-w-0 flex-1 truncate">{t("tasks:resources.title")}</DialogTitle>
      </div>
      <div className="flex min-h-0 flex-col sm:flex-row">
        <nav aria-label={t("tasks:resources.categories")} className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 sm:w-44 sm:flex-col sm:border-r sm:border-b-0">
          {categories.map(({ id, icon: Icon }) => <Button key={id} variant="ghost" size="sm" disabled={draft.busy || pending || addingRepository} aria-current={category === id ? "page" : undefined} className="shrink-0 justify-start gap-2 text-xs aria-[current=page]:bg-muted" onClick={() => setCategory(id)}>
            <Icon className="size-3.5" />{t(`tasks:resources.category.${id}`)}
          </Button>)}
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-auto p-4 sm:min-h-[440px]" data-resource-category={category}>
          <TaskResourceManageList task={updatedTask} category={category} selected={selected} archivedOpen={archivedOpen} readOnly={readOnly}
            onToggle={(key) => setSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })}
            onSelectAll={(keys) => setSelected(new Set(keys))} onClearSelection={() => setSelected(new Set())} onArchivedOpenChange={setArchivedOpen}
            onOpen={openItem} onRestore={(items) => void runBatch(() => useTaskStore.getState().restoreResources(updatedTask.id, items))} />
          {!readOnly && <>
            {category === "repositories" && <TaskResourcePickerContent excludedIds={(updatedTask.resources ?? []).filter((resource) => resource.mode === "folder").map((resource) => resource.repositoryId ?? resource.resourceId)} addedResources={updatedTask.resources}
              repositoriesDirectory={repositoriesDirectory} selection={draft.repositorySelection} disabled={draft.busy || pending} adding={addingRepository} onAddingChange={setAddingRepository} />}
            {isIssue && <><TaskIssuePickerContent key={category} group={issueGroup} selected={category === "issues" ? draft.issues : draft.prs} onChange={category === "issues" ? draft.setIssues : draft.setPrs} lockedIds={(updatedTask.links ?? []).filter((item) => item.group === issueGroup).map((item) => item.id)} disabled={disabled} />{draft.alreadyArchived && <p className="text-xs text-muted-foreground">{t("tasks:resources.alreadyArchived")}</p>}</>}
            {category === "links" && <div className="space-y-3"><TaskWebLinkFields url={draft.url} title={draft.linkTitle} onUrlChange={(value) => { draft.setPreferPlainLink(false); draft.setUrl(value); }} onTitleChange={draft.setLinkTitle} disabled={disabled} invalid={Boolean(draft.url.trim()) && !isTaskLinkUrl(draft.url.trim())} />
              {draft.resolving && <p className="text-xs text-muted-foreground">{t("issues:menu.resolving")}</p>}
              {draft.resolveError && <p role="status" className="text-xs text-muted-foreground">{t(`issues:menu.resolve.${draft.resolveError}` as "issues:menu.resolve.notFound", { defaultValue: t("issues:menu.resolve.unreadable") })}</p>}
              {draft.resolvedIssue && !draft.preferPlainLink && <p className="text-xs text-muted-foreground">{draft.resolvedIssue.group} · {draft.resolvedIssue.title}</p>}
              {(draft.resolvedIssue || draft.resolveError) && <Button type="button" variant="link" className="h-auto px-0 text-xs" disabled={disabled} onClick={() => draft.setPreferPlainLink(true)}>{t("issues:menu.asLink")}</Button>}
              {draft.duplicateLink && <p className="text-xs text-muted-foreground">{t("tasks:resources.alreadyLinked")}</p>}{draft.alreadyArchived && <p className="text-xs text-muted-foreground">{t("tasks:resources.alreadyArchived")}</p>}</div>}
            {category === "notes" && <><Input aria-label={t("tasks:resources.noteTitle")} placeholder={t("tasks:resources.noteTitle")} value={draft.noteTitle} maxLength={160} disabled={disabled} onChange={(event) => draft.setNoteTitle(event.target.value)} className="h-8 text-xs" />
              <div className="flex min-h-56 flex-1 flex-col"><TaskMarkdownEditor value={draft.content} onChange={draft.setContent} disabled={disabled} /></div>
            </>}
            {category === "files" && <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-xs">
              <File className="size-8 text-muted-foreground" /><p className="max-w-md leading-6 text-muted-foreground">{t("tasks:resources.fileDescription")}</p>
              {draft.file && <div className="max-w-full"><p className="truncate font-medium">{draft.file.name}</p><p className="mt-1 break-all text-muted-foreground">{draft.file.path}</p></div>}
              <Button variant="secondary" size="sm" disabled={disabled} onClick={() => void draft.chooseFile()}>{t(draft.file ? "tasks:resources.changeFile" : "tasks:resources.chooseFile")}</Button>
              {draft.duplicateFile && <p className="text-muted-foreground">{t("tasks:resources.alreadyLinked")}</p>}{draft.alreadyArchived && <p className="text-muted-foreground">{t("tasks:resources.alreadyArchived")}</p>}
            </div>}
          </>}
          {(draft.error !== null || actionError !== null) && <p role="alert" className="text-xs text-destructive">{getTaskError(draft.error ?? actionError)}</p>}
        </div>
      </div>
      <TaskResourceUndoBar taskId={updatedTask.id} />
      <footer className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
        <Button type="button" variant="outline" size="sm" className="shrink-0" data-cleanup disabled={readOnly || pending || cleanupEmpty} onClick={() => setCleanupOpen(true)}>{t("tasks:resources.cleanup")}</Button>
        {selectedItems.length > 0 ? <>
          <span role="status" className="mr-auto text-xs text-muted-foreground">{t("tasks:resources.selected", { count: selectedItems.length })}</span>
          <Button variant="ghost" size="sm" disabled={pending || readOnly} onClick={() => setSelected(new Set())}>{t("common:actions.cancel")}</Button>
          {canArchive && <Button variant="outline" size="sm" disabled={pending || readOnly} onClick={() => void runBatch(() => useTaskStore.getState().archiveResources(updatedTask.id, toResourceRefs(selectedItems.filter((item) => item.archivable))))}>{t("tasks:resources.batch.archive")}</Button>}
          {canDetach && <Button variant="outline" size="sm" disabled={pending || readOnly} onClick={() => setBatchConfirm("detach")}>{t("tasks:resources.batch.detach")}</Button>}
          {canDelete && <Button variant="destructive" size="sm" disabled={pending || readOnly} onClick={() => setBatchConfirm("delete")}>{t("tasks:resources.batch.delete")}</Button>}
        </> : <>
          <span role="status" className="mr-auto text-xs text-muted-foreground">{draft.added ? t("tasks:resources.added") : t("common:selection.count", { count: draft.count })}</span>
          <Button variant="ghost" size="sm" disabled={draft.busy || pending || addingRepository} onClick={onClose}>{t("common:actions.cancel")}</Button>
          {!readOnly && <>
            <Button variant="outline" size="sm" disabled={disabled || !draft.count} onClick={() => void add(false)}>{t("tasks:resources.keepAdding")}</Button>
            <Button size="sm" disabled={disabled || !draft.count} onClick={() => void add(true)}>{t("tasks:resources.addToTask")}</Button>
          </>}
        </>}
      </footer>
    </DialogContent>
    {cleanupOpen && <TaskResourceCleanupDialog plan={cleanupPlan} busy={cleanupBusy} onClose={() => setCleanupOpen(false)} onConfirm={() => {
      setCleanupBusy(true);
      void runBatch(() => useTaskStore.getState().applyResourceCleanup(updatedTask.id)).finally(() => { setCleanupBusy(false); setCleanupOpen(false); });
    }} />}
    {batchConfirm && <TaskResourceBatchConfirmDialog
      action={batchConfirm}
      count={batchConfirm === "delete"
        ? selectedItems.filter((item) => item.deletable).flatMap((item) => item.ids).length
        : selectedItems.filter((item) => item.detachable).length}
      busy={pending}
      onClose={() => setBatchConfirm(null)}
      onConfirm={() => {
        const action = batchConfirm;
        setBatchConfirm(null);
        if (action === "delete") {
          void runBatch(() => useTaskStore.getState().deleteAttachments(updatedTask.id, selectedItems.filter((item) => item.deletable).flatMap((item) => item.ids)));
        } else {
          void runBatch(() => useTaskStore.getState().detachResources(updatedTask.id, toResourceRefs(selectedItems.filter((item) => item.detachable))));
        }
      }} />}
  </Dialog>;
}

export type { TaskResourceRef };
