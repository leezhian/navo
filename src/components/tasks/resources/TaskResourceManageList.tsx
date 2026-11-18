import { BookMarked, CircleDot, File, Folder, GitBranch, GitPullRequest, Link2, MoreVertical, NotebookText, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { TaskResourceCategory } from "@/shared/taskResourceTypes";
import { itemKey, type TaskManagedListItem } from "@/utils/taskResourceInventory";

export type ResourceAction = "archive" | "detach" | "delete" | "restore";

interface TaskResourceManageListProps {
  /** 当前类型的活动资源与归档资源，计数和全选均只针对活动行。 */
  active: TaskManagedListItem[];
  archived: TaskManagedListItem[];
  category: TaskResourceCategory;
  /** 跨操作保持选择，切换分类时清空。 */
  selected: Set<string>;
  onSelect: (keys: Set<string>) => void;
  archivedOpen: boolean;
  onArchivedOpenChange: (open: boolean) => void;
  /** 归档任务不允许修改；提交期间锁定冲突操作。 */
  readOnly: boolean;
  busy: boolean;
  onAdd: () => void;
  onOpen: (item: TaskManagedListItem) => void;
  /** 单行菜单与批量入口使用相同的确认和撤销流程。 */
  onAction: (operation: ResourceAction, items: TaskManagedListItem[]) => void;
}

const icons = { repositories: BookMarked, issues: CircleDot, pullRequests: GitPullRequest, files: File, notes: NotebookText, links: Link2 };

export function TaskResourceManageList({ active, archived, category, selected, onSelect, archivedOpen, onArchivedOpenChange, readOnly, busy, onAdd, onOpen, onAction }: TaskResourceManageListProps) {
  const { t, i18n } = useTranslation(["tasks", "common"]);
  const chosen = active.filter((item) => selected.has(itemKey(item)));
  const allSelected = active.length === chosen.length;
  const categoryLabel = t(`tasks:resources.category.${category}`);
  const CategoryIcon = icons[category];
  const addButton = !readOnly && <Button size="sm" variant="secondary" data-resource-add disabled={busy} onClick={onAdd}><Plus />{t("tasks:resources.addCategory", { category: categoryLabel })}</Button>;
  const skippedWorktrees = chosen.filter((item) => item.worktree).length;
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" });
  function toggle(item: TaskManagedListItem) {
    const next = new Set(selected);
    const key = itemKey(item);
    if (next.has(key)) next.delete(key); else next.add(key);
    onSelect(next);
  }
  return <>
    {active.length === 0 ? <Empty>
      <EmptyHeader><EmptyMedia variant="icon"><CategoryIcon /></EmptyMedia><EmptyTitle>{t("tasks:resources.onTaskEmpty")}</EmptyTitle></EmptyHeader>
      {addButton}
    </Empty> : <div className="space-y-1">
      <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1 px-2 text-xs">
        {!readOnly && <Checkbox disabled={busy} checked={chosen.length > 0 && !allSelected ? "indeterminate" : allSelected} aria-label={t("tasks:resources.selectAll")} onCheckedChange={() => onSelect(new Set(allSelected ? [] : active.map(itemKey)))} />}
        <span role="status" className="mr-auto font-medium">{chosen.length ? t("tasks:resources.selected", { count: chosen.length }) : t("tasks:resources.count", { count: active.length, category: categoryLabel })}
          {skippedWorktrees > 0 && t("tasks:resources.skippedWorktrees", { count: skippedWorktrees })}</span>
        {!readOnly && (chosen.length ? <div className="flex flex-wrap items-center gap-1" data-batch-toolbar>
          <Button size="sm" variant="ghost" disabled={busy || !chosen.some((item) => item.archivable)} onClick={() => onAction("archive", chosen)}>{t("tasks:resources.batch.archive")}</Button>
          {chosen.some((item) => item.detachable) && <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" disabled={busy} onClick={() => onAction("detach", chosen)}>{t("tasks:resources.batch.detach")}</Button>}
          {chosen.some((item) => item.deletable) && <Button size="sm" variant="destructive" disabled={busy} onClick={() => onAction("delete", chosen)}>{t("tasks:resources.batch.delete")}</Button>}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSelect(new Set())}>{t("tasks:resources.clear")}</Button>
        </div> : addButton)}
      </div>
      <ul data-resource-existing>
        {active.map((item) => {
          const key = itemKey(item);
          const workspace = item.kind === "workspace";
          const Icon = item.worktree ? GitBranch : category === "repositories" && item.folder ? Folder : icons[category];
          return <li key={key} data-existing-kind={item.kind} data-existing-id={item.id} data-selected={selected.has(key)} className="flex items-start gap-4 rounded-lg px-2 py-2 text-sm hover:bg-muted/60 data-[selected=true]:bg-accent">
            {!readOnly && <Checkbox className="mt-0.5" checked={selected.has(key)} disabled={busy} aria-label={item.title} onCheckedChange={() => toggle(item)} />}
            <button type="button" className="flex min-w-0 flex-1 items-start gap-2 rounded-sm text-left focus-visible:outline-ring" title={item.detail || item.title} disabled={busy || (workspace && readOnly)} aria-pressed={workspace && !readOnly ? selected.has(key) : undefined} onClick={() => workspace ? toggle(item) : onOpen(item)}><Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span className="min-w-0"><span className="block truncate">{item.title}</span>{item.detail && <span className="mt-1 block truncate text-xs text-muted-foreground">{item.detail}</span>}</span></button>
            {item.date && Number.isFinite(Date.parse(item.date)) && <time dateTime={item.date} className="mt-0.5 text-xs text-muted-foreground">{dateFormat.format(new Date(item.date))}</time>}
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" disabled={busy} aria-label={t("tasks:resources.rowMenu", { title: item.title })}><MoreVertical /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onOpen(item)}>{t("common:actions.open")}</DropdownMenuItem>
                {!readOnly && item.archivable && <DropdownMenuItem onSelect={() => onAction("archive", [item])}>{t("tasks:resources.batch.archive")}</DropdownMenuItem>}
                {!readOnly && item.detachable && <DropdownMenuItem variant="destructive" onSelect={() => onAction("detach", [item])}>{t("tasks:resources.batch.detach")}</DropdownMenuItem>}
                {!readOnly && item.deletable && <DropdownMenuItem variant="destructive" onSelect={() => onAction("delete", [item])}>{t("tasks:resources.batch.delete")}</DropdownMenuItem>}
              </DropdownMenuContent></DropdownMenu>
          </li>;
        })}
      </ul>
    </div>}
    {archived.length > 0 && <div><Button type="button" variant="ghost" size="sm" data-archived-toggle aria-expanded={archivedOpen} onClick={() => onArchivedOpenChange(!archivedOpen)}>{t("tasks:resources.archived.toggle")} ({archived.length})</Button>
      {archivedOpen && <ul data-resource-archived className="space-y-1 px-2">{archived.map((item) => <li key={itemKey(item)} data-existing-kind={item.kind} data-existing-id={item.id} className="flex items-center gap-2 text-xs">
        <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => onOpen(item)}>{item.title}</button>
        {!readOnly && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction("restore", [item])}>{t("tasks:resources.restore")}</Button>}
      </li>)}</ul>}
    </div>}
  </>;
}
