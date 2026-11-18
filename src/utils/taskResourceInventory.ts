import type { Task } from "@/domain/tasks";
import type { TaskResourceCategory } from "@/shared/taskResourceTypes";
import type { TaskResourceRef } from "@/shared/taskResourceLifecycle";
import { aggregateTaskWebLinks } from "@/utils/taskWebLinks";
import { getFolderName } from "./resourceNames";

export interface TaskManagedListItem {
  kind: "workspace" | "issue" | "note" | "file" | "attachment" | "link";
  id: string;
  ids: string[];
  title: string;
  detail?: string;
  date?: string;
  worktree?: boolean;
  folder?: boolean;
  archivable: boolean;
  detachable: boolean;
  deletable: boolean;
}

export function itemKey(item: TaskManagedListItem) {
  return `${item.kind}:${item.id}`;
}

export function collectCategoryItems(task: Task, category: TaskResourceCategory) {
  const active: TaskManagedListItem[] = [];
  const archived: TaskManagedListItem[] = [];
  if (category === "repositories") {
    for (const resource of task.resources ?? []) {
      active.push({
        kind: "workspace", id: resource.resourceId, ids: [resource.resourceId],
        title: resource.mode === "worktree" ? getFolderName(resource.workingPath) : resource.name, detail: resource.workingPath,
        date: resource.addedAt, worktree: resource.mode === "worktree", folder: resource.mode === "folder",
        archivable: false, detachable: true, deletable: false,
      });
    }
  }
  if (category === "issues" || category === "pullRequests") {
    const group = category === "pullRequests" ? "PR" : "ISSUE";
    const toItem = (link: NonNullable<Task["links"]>[number]): TaskManagedListItem => ({
      kind: "issue", id: link.id, ids: [link.id], title: link.title, date: link.date,
      detail: [link.provider, link.repository || link.projectName, link.status].filter(Boolean).join(" · "),
      archivable: false, detachable: true, deletable: false,
    });
    for (const link of (task.links ?? []).filter((item) => item.group === group)) active.push(toItem(link));
    for (const link of (task.archivedLinks ?? []).filter((item) => item.group === group)) archived.push(toItem(link));
  }
  if (category === "notes") {
    for (const note of task.notes ?? []) {
      active.push({ kind: "note", id: note.id, ids: [note.id], date: note.createdAt, title: note.title || note.content.slice(0, 80), archivable: true, detachable: false, deletable: false });
    }
    for (const note of task.archivedNotes ?? []) {
      archived.push({ kind: "note", id: note.id, ids: [note.id], date: note.createdAt, title: note.title || note.content.slice(0, 80), archivable: true, detachable: false, deletable: false });
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
