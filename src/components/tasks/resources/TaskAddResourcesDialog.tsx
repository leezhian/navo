import { useEffect, useMemo, useState } from "react";
import { Tabs } from "radix-ui";
import { BookMarked, ChevronLeft, CircleDot, File, Maximize2, Minimize2, GitPullRequest, Link2, NotebookText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import type { TaskResourceCategory } from "@/shared/taskResourceTypes";
import type { TaskResourceCleanupPlan, TaskResourceRef } from "@/shared/taskResourceLifecycle";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTaskResourceDraft } from "@/hooks/useTaskResourceDraft";
import { getTaskError } from "@/services/taskErrors";
import { getTasksApi } from "@/services/taskApi";
import { useTaskStore } from "@/stores/taskStore";
import { useTaskResourceUndoStore } from "@/stores/taskResourceUndoStore";
import { TaskResourceBatchConfirmDialog } from "./TaskResourceBatchConfirmDialog";
import { TaskResourceCleanupDialog } from "./TaskResourceCleanupDialog";
import { TaskResourceUndoBar } from "../workspace/TaskResourceUndoBar";
import { TaskResourceManageList, type ResourceAction } from "./TaskResourceManageList";
import { collectCategoryItems, toResourceRefs, type TaskManagedListItem } from "@/utils/taskResourceInventory";
import { TaskResourceAddForm } from "./TaskResourceAddForm";

const categories = [
  { id: "repositories", icon: BookMarked }, { id: "issues", icon: CircleDot }, { id: "pullRequests", icon: GitPullRequest },
  { id: "notes", icon: NotebookText }, { id: "links", icon: Link2 }, { id: "files", icon: File },
] as const;

interface TaskAddResourcesDialogProps {
  /** 保存成功更新已有任务，不创建任务或启动 Agent。 */
  task: Task;
  /** 顶部入口默认仓库页，分类加号直接定位对应页。 */
  initialCategory: TaskResourceCategory;
  /** 分类加号直达添加页；通用资源入口默认管理已关联条目。 */
  initialAdding?: boolean;
  onClose: () => void;
  /** 打开已有文件或附件的只读预览，由工作台关闭本窗口后展示右侧栏。 */
  onOpenFile?: (kind: "file" | "attachment", id: string) => void;
  onOpenNote?: (id: string) => void;
  onOpenLink?: (id: string) => void;
  onOpenRepository?: (resourceId: string) => void;
  onPreview?: (title: string, body: string) => void;
}

export function TaskAddResourcesDialog({
  task, initialCategory, initialAdding = false, onClose, onOpenFile, onOpenNote, onOpenLink, onOpenRepository, onPreview,
}: TaskAddResourcesDialogProps) {
  const { t } = useTranslation(["tasks", "common", "taskCreate", "issues"]);
  const [category, setCategory] = useState(initialCategory);
  const [adding, setAdding] = useState(initialAdding);
  const [expanded, setExpanded] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupPlan, setCleanupPlan] = useState<TaskResourceCleanupPlan | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [batchConfirm, setBatchConfirm] = useState<{ action: "detach" | "delete"; items: TaskManagedListItem[] } | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const updatedTask = useTaskStore((state) => state.tasks.find((item) => item.id === task.id)) ?? task;
  const draft = useTaskResourceDraft(updatedTask, category);
  const pending = useTaskStore((state) => state.pending);
  const readOnly = updatedTask.status === "ARCHIVED";
  const busy = draft.busy || pending || pickerBusy;
  const addingView = adding && !readOnly;
  const tabs = useMemo(() => categories.map((tab) => ({ ...tab, ...collectCategoryItems(updatedTask, tab.id) })), [updatedTask]);
  const { active, archived } = tabs.find((tab) => tab.id === category) ?? tabs[0];

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
  function handleAction(operation: ResourceAction, items: TaskManagedListItem[]) {
    if (busy || readOnly) return;
    const store = useTaskStore.getState();
    if (operation === "restore") void runBatch(() => store.restoreResources(task.id, toResourceRefs(items)));
    else if (operation === "archive") void runBatch(() => store.archiveResources(task.id, toResourceRefs(items.filter((item) => item.archivable))));
    else setBatchConfirm({ action: operation, items: items.filter((item) => operation === "detach" ? item.detachable : item.deletable) });
  }

  const size = expanded ? "h-[calc(100dvh-16px)] w-[calc(100%-16px)] max-w-none sm:max-w-none" : "h-[min(88dvh,820px)] w-[94vw] max-w-[94vw] sm:max-w-[1120px]";
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className={`flex flex-col gap-0 overflow-hidden p-0 ${size}`} showCloseButton={!busy} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onInteractOutside={(event) => { if (busy) event.preventDefault(); }}>
      <header className="relative shrink-0 px-5 pt-5 pb-3"><DialogTitle>{t("tasks:resources.title")}</DialogTitle>
        <DialogDescription className="mt-1 pr-14 text-xs">{t("tasks:resources.windowDescription")}</DialogDescription>
        <Button size="icon-sm" variant="ghost" className="absolute top-2 right-10" aria-label={t(expanded ? "tasks:resources.collapse" : "tasks:resources.expand")} aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 /> : <Maximize2 />}</Button>
      </header>
      <Tabs.Root value={category} onValueChange={(value) => { setCategory(value as TaskResourceCategory); setAdding(false); }} className="flex min-h-0 flex-1 flex-col">
        <Tabs.List aria-label={t("tasks:resources.categories")} className="flex h-9 shrink-0 items-stretch gap-5 overflow-x-auto border-b px-5">
          {tabs.map(({ id, icon: Icon, active: items }) => <Tabs.Trigger key={id} value={id} disabled={busy}
            className="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:text-foreground">
            <Icon className="size-3.5" /><span>{t(`tasks:resources.category.${id}`)}</span>
            {items.length > 0 && <span className="text-xs tabular-nums text-muted-foreground">{items.length}</span>}
          </Tabs.Trigger>)}
        </Tabs.List>
        <Tabs.Content key={category} value={category} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-auto p-4 [&>*]:shrink-0" data-resource-category={category}>
          {addingView ? <>
            <Button type="button" size="sm" variant="ghost" data-resource-back className="self-start px-1" disabled={busy} onClick={() => setAdding(false)}><ChevronLeft />{t("tasks:resources.back", { category: t(`tasks:resources.category.${category}`), count: active.length })}</Button>
            <TaskResourceAddForm task={updatedTask} category={category} draft={draft} disabled={busy} onPickerBusy={setPickerBusy} />
          </> : <TaskResourceManageList active={active} archived={archived} category={category} selected={selected} archivedOpen={archivedOpen} readOnly={readOnly} busy={busy}
            onSelect={setSelected} onArchivedOpenChange={setArchivedOpen} onOpen={openItem} onAction={handleAction} onAdd={() => setAdding(true)} />}
          {((addingView && draft.error !== null) || actionError !== null) && <p role="alert" className="text-xs text-destructive">{getTaskError(actionError ?? draft.error)}</p>}
          {!addingView && !readOnly && !cleanupEmpty && <Button type="button" variant="ghost" size="sm" className="self-end" data-cleanup disabled={busy} onClick={() => setCleanupOpen(true)}>{t("tasks:resources.cleanup")}</Button>}
        </Tabs.Content>
      </Tabs.Root>
      <TaskResourceUndoBar taskId={updatedTask.id} />
      {addingView && category !== "repositories" && <footer className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
        <span role="status" className="mr-auto text-xs text-muted-foreground">{draft.added ? t("tasks:resources.added") : t("common:selection.count", { count: draft.count })}</span>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>{t("common:actions.cancel")}</Button>
        <Button variant="outline" size="sm" disabled={busy || !draft.count} onClick={() => void add(false)}>{t("tasks:resources.keepAdding")}</Button>
        <Button size="sm" disabled={busy || !draft.count} onClick={() => void add(true)}>{t("tasks:resources.addToTask")}</Button>
      </footer>}
    </DialogContent>
    {cleanupOpen && <TaskResourceCleanupDialog plan={cleanupPlan} busy={cleanupBusy} onClose={() => setCleanupOpen(false)} onConfirm={() => {
      setCleanupBusy(true);
      void runBatch(() => useTaskStore.getState().applyResourceCleanup(updatedTask.id)).finally(() => { setCleanupBusy(false); setCleanupOpen(false); });
    }} />}
    {batchConfirm && <TaskResourceBatchConfirmDialog
      action={batchConfirm.action}
      count={batchConfirm.action === "delete" ? batchConfirm.items.flatMap((item) => item.ids).length : batchConfirm.items.length}
      busy={pending}
      onClose={() => setBatchConfirm(null)}
      onConfirm={() => {
        const { action, items } = batchConfirm;
        setBatchConfirm(null);
        if (action === "delete") {
          void runBatch(() => useTaskStore.getState().deleteAttachments(updatedTask.id, items.flatMap((item) => item.ids)));
        } else {
          void runBatch(() => useTaskStore.getState().detachResources(updatedTask.id, toResourceRefs(items)));
        }
      }} />}
  </Dialog>;
}

export type { TaskResourceRef };
