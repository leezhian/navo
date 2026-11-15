import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import type { TaskResourceCategory } from "@/shared/taskResourceTypes";
import type { TaskResourceRef } from "@/shared/taskResourceLifecycle";
import { aggregateTaskWebLinks } from "@/utils/taskWebLinks";
import { Button } from "@/components/ui/button";

export interface TaskManagedListItem {
  kind: "workspace" | "issue" | "note" | "file" | "attachment" | "link";
  id: string;
  ids: string[];
  title: string;
  detail?: string;
  archivable: boolean;
  detachable: boolean;
  deletable: boolean;
}

interface TaskResourceManageListProps {
  task: Task;
  category: TaskResourceCategory;
  selected: Set<string>;
  archivedOpen: boolean;
  readOnly: boolean;
  onToggle: (key: string) => void;
  onSelectAll: (keys: string[]) => void;
  onClearSelection: () => void;
  onArchivedOpenChange: (open: boolean) => void;
  onOpen: (item: TaskManagedListItem) => void;
  onRestore: (items: TaskResourceRef[]) => void;
}

function itemKey(item: TaskManagedListItem) {
  return `${item.kind}:${item.id}`;
}

export function collectCategoryItems(task: Task, category: TaskResourceCategory) {
  const active: TaskManagedListItem[] = [];
  const archived: TaskManagedListItem[] = [];
  if (category === "repositories") {
    for (const resource of task.resources ?? []) {
      active.push({
        kind: "workspace", id: resource.resourceId, ids: [resource.resourceId],
        title: resource.name, detail: resource.workingPath,
        archivable: false, detachable: true, deletable: false,
      });
    }
  }
  if (category === "issues" || category === "pullRequests") {
    const group = category === "pullRequests" ? "PR" : "ISSUE";
    const toItem = (link: NonNullable<Task["links"]>[number]): TaskManagedListItem => ({
      kind: "issue", id: link.id, ids: [link.id], title: link.title,
      detail: [link.provider, link.repository || link.projectName, link.status].filter(Boolean).join(" · "),
      archivable: false, detachable: true, deletable: false,
    });
    for (const link of (task.links ?? []).filter((item) => item.group === group)) active.push(toItem(link));
    for (const link of (task.archivedLinks ?? []).filter((item) => item.group === group)) archived.push(toItem(link));
  }
  if (category === "notes") {
    for (const note of task.notes ?? []) {
      active.push({ kind: "note", id: note.id, ids: [note.id], title: note.title || note.content.slice(0, 80), archivable: true, detachable: false, deletable: false });
    }
    for (const note of task.archivedNotes ?? []) {
      archived.push({ kind: "note", id: note.id, ids: [note.id], title: note.title || note.content.slice(0, 80), archivable: true, detachable: false, deletable: false });
    }
  }
  if (category === "files") {
    for (const file of task.files ?? []) {
      active.push({ kind: "file", id: file.id, ids: [file.id], title: file.name, detail: file.path, archivable: true, detachable: true, deletable: false });
    }
    for (const file of task.attachments ?? []) {
      active.push({ kind: "attachment", id: file.id, ids: [file.id], title: file.name, archivable: true, detachable: false, deletable: true });
    }
    for (const file of task.archivedFiles ?? []) {
      archived.push({ kind: "file", id: file.id, ids: [file.id], title: file.name, detail: file.path, archivable: true, detachable: true, deletable: false });
    }
    for (const file of task.archivedAttachments ?? []) {
      archived.push({ kind: "attachment", id: file.id, ids: [file.id], title: file.name, archivable: true, detachable: false, deletable: true });
    }
  }
  if (category === "links") {
    for (const link of aggregateTaskWebLinks(task.webLinks ?? [])) {
      active.push({ kind: "link", id: link.id, ids: link.ids, title: link.title || link.url, detail: link.url, archivable: true, detachable: true, deletable: false });
    }
    for (const link of aggregateTaskWebLinks(task.archivedWebLinks ?? [])) {
      archived.push({ kind: "link", id: link.id, ids: link.ids, title: link.title || link.url, detail: link.url, archivable: true, detachable: true, deletable: false });
    }
  }
  return { active, archived };
}

export function toResourceRefs(items: TaskManagedListItem[]): TaskResourceRef[] {
  return items.flatMap((item) => item.ids.map((id) => ({ kind: item.kind, id })));
}

export function TaskResourceManageList({
  task, category, selected, archivedOpen, readOnly, onToggle, onSelectAll, onClearSelection, onArchivedOpenChange, onOpen, onRestore,
}: TaskResourceManageListProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const { active, archived } = collectCategoryItems(task, category);
  const keys = active.map(itemKey);
  const allSelected = keys.length > 0 && keys.every((key) => selected.has(key));
  const kindLabel = t(`tasks:resources.kind.${category === "files" ? "files" : category === "notes" ? "notes" : category === "issues" ? "issues" : category === "pullRequests" ? "pullRequests" : "links"}`);

  return <div className="space-y-2">
    <div className="flex items-center gap-2">
      <p className="text-xs font-medium">{t("tasks:resources.onTask")}</p>
      {!readOnly && keys.length > 0 && <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <input type="checkbox" checked={allSelected} aria-label={t("tasks:resources.selectAll")}
          onChange={() => { if (allSelected) onClearSelection(); else onSelectAll(keys); }} />
        {t("tasks:resources.selectAll")}
      </label>}
    </div>
    {active.length === 0 && <p className="text-xs text-muted-foreground">{t("tasks:resources.onTaskEmpty")}</p>}
    <ul data-resource-existing className="space-y-0.5">
      {active.map((item) => {
        const key = itemKey(item);
        return <li key={key} data-existing-kind={item.kind} data-existing-id={item.id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/60">
          {!readOnly && <input type="checkbox" checked={selected.has(key)} aria-label={item.title} onChange={() => onToggle(key)} />}
          <button type="button" className="min-w-0 flex-1 truncate text-left text-xs" title={item.detail || item.title} onClick={() => onOpen(item)}>
            <span className="block truncate">{item.title}</span>
            {item.detail && <span className="block truncate text-[11px] text-muted-foreground">{item.detail}</span>}
          </button>
        </li>;
      })}
    </ul>
    {["notes", "files", "links", "issues", "pullRequests"].includes(category) && <div>
      <Button type="button" variant="ghost" size="sm" className="h-7 px-1 text-[11px]" data-archived-toggle
        aria-expanded={archivedOpen} onClick={() => onArchivedOpenChange(!archivedOpen)}>
        {t("tasks:resources.archived.toggle")}{archived.length ? ` (${archived.length})` : ""}
      </Button>
      {archivedOpen && <div data-resource-archived className="mt-1 space-y-1">
        <p className="text-[11px] text-muted-foreground">{t("tasks:resources.archived.banner")}</p>
        {archived.length === 0 && <p className="text-xs text-muted-foreground">{t("tasks:resources.archived.empty", { kind: kindLabel })}</p>}
        <ul className="space-y-0.5">
          {archived.map((item) => <li key={itemKey(item)} data-existing-kind={item.kind} data-existing-id={item.id} className="flex items-center gap-2 rounded px-1 py-0.5">
            <button type="button" className="min-w-0 flex-1 truncate text-left text-xs" title={item.detail || item.title} onClick={() => onOpen(item)}>
              <span className="block truncate">{item.title}</span>
            </button>
            {!readOnly && <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => onRestore(toResourceRefs([item]))}>{t("tasks:resources.restore")}</Button>}
          </li>)}
        </ul>
      </div>}
    </div>}
  </div>;
}
