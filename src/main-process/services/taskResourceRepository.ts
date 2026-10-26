import type { DatabaseSync } from "node:sqlite";
import type { AddTaskResourcesInput, TaskFileReference, TaskNote } from "../../shared/taskResourceTypes";
import type { TaskResource } from "../../shared/taskTypes";
import { openAppDatabase } from "./appDatabase";

export function readTaskExtraResources(database: DatabaseSync, namespace: string, taskId: string) {
  const notes: TaskNote[] = database.prepare("SELECT id,title,content FROM task_notes WHERE namespace=? AND task_id=? ORDER BY rowid").all(namespace, taskId)
    .map((row) => ({ id: String(row.id), title: String(row.title), content: String(row.content) }));
  const files: TaskFileReference[] = database.prepare("SELECT id,name,path,size FROM task_file_references WHERE namespace=? AND task_id=? ORDER BY rowid").all(namespace, taskId)
    .map((row) => ({ id: String(row.id), name: String(row.name), path: String(row.path), size: Number(row.size) }));
  return { notes, files };
}

export class TaskResourceRepository {
  constructor(private readonly filename: string, private readonly namespace: string) {}
  async hasBatch(taskId: string, requestId: string) {
    const database = await openAppDatabase(this.filename);
    try { return Boolean(database.prepare("SELECT 1 FROM task_resource_batches WHERE namespace=? AND task_id=? AND request_id=?").get(this.namespace, taskId, requestId)); }
    finally { database.close(); }
  }
  async appendWorkspaces(taskId: string, requestId: string, resources: TaskResource[]) {
    const database = await openAppDatabase(this.filename);
    const namespace = this.namespace;
    let transactionOpen = false;
    try {
      database.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      const task = database.prepare("SELECT status FROM tasks WHERE namespace=? AND id=?").get(namespace, taskId);
      if (!task) throw new Error("TASK_NOT_FOUND");
      if (task.status === "ARCHIVED" || database.prepare("SELECT 1 FROM task_deletions WHERE namespace=? AND task_id=?").get(namespace, taskId)) throw new Error("TASK_BUSY");
      if (database.prepare("SELECT 1 FROM task_resource_batches WHERE namespace=? AND task_id=? AND request_id=?").get(namespace, taskId, requestId)) throw new Error("TASK_RESOURCE_CHANGED");
      let position = Number(database.prepare("SELECT COALESCE(MAX(position),-1)+1 AS next FROM task_resources WHERE namespace=? AND task_id=?").get(namespace, taskId)?.next);
      const firstResource = position === 0;
      let changed = false;
      const stored = database.prepare("SELECT position,data FROM task_resources WHERE namespace=? AND task_id=?").all(namespace, taskId)
        .map((row) => ({ position: Number(row.position), resource: JSON.parse(String(row.data)) as TaskResource }));
      for (const resource of resources) {
        const current = stored.find((row) => row.resource.resourceId === resource.resourceId);
        if (!current || JSON.stringify(current.resource) !== JSON.stringify(resource)) changed = true;
        if (current) database.prepare("UPDATE task_resources SET data=? WHERE namespace=? AND task_id=? AND position=?").run(JSON.stringify(resource), namespace, taskId, current.position);
        else database.prepare("INSERT INTO task_resources VALUES (?,?,?,?)").run(namespace, taskId, position++, JSON.stringify(resource));
        if (resource.mode === "worktree" && resource.ownership) database.prepare("INSERT OR IGNORE INTO managed_workspaces VALUES (?,?,?,?,?)")
          .run(namespace, taskId, resource.workingPath, resource.targetBranch, resource.originalPath);
      }
      if (firstResource && resources.length) database.prepare("UPDATE tasks SET project_name=? WHERE namespace=? AND id=?").run(resources[0].name, namespace, taskId);
      if (changed) this.touchTask(database, taskId);
      database.prepare("INSERT INTO task_resource_batches VALUES (?,?,?)").run(namespace, taskId, requestId);
      database.prepare("DELETE FROM task_operations WHERE namespace=? AND id=?").run(namespace, requestId);
      database.exec("COMMIT");
      transactionOpen = false;
    } catch (error) { if (transactionOpen) database.exec("ROLLBACK"); throw error; }
    finally { database.close(); }
  }
  async append(taskId: string, input: AddTaskResourcesInput, files: TaskFileReference[]) {
    const database = await openAppDatabase(this.filename);
    const namespace = this.namespace;
    let transactionOpen = false;
    try {
      database.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      if (!database.prepare("SELECT 1 FROM tasks WHERE namespace=? AND id=?").get(namespace, taskId)) throw new Error("TASK_NOT_FOUND");
      if (!database.prepare("SELECT 1 FROM task_resource_batches WHERE namespace=? AND task_id=? AND request_id=?").get(namespace, taskId, input.requestId)) {
        let changed = false;
        for (const link of input.links) {
          const existing = database.prepare("SELECT data FROM task_links WHERE namespace=? AND task_id=? AND link_id=?").get(namespace, taskId, link.id);
          if (existing && JSON.parse(String(existing.data)).group !== link.group) throw new Error("TASK_INVALID");
          if (!existing) {
            database.prepare("INSERT INTO task_links VALUES (?,?,?,?)").run(namespace, taskId, link.id, JSON.stringify(link));
            changed = true;
          }
        }
        const urls = new Set(database.prepare("SELECT url FROM task_web_links WHERE namespace=? AND task_id=?").all(namespace, taskId).map((row) => new URL(String(row.url)).href));
        let position = Number(database.prepare("SELECT COALESCE(MAX(position),-1)+1 AS next FROM task_web_links WHERE namespace=? AND task_id=?").get(namespace, taskId)?.next);
        for (const link of input.webLinks) {
          const url = new URL(link.url).href;
          if (urls.has(url)) continue;
          database.prepare("INSERT INTO task_web_links VALUES (?,?,?,?,?,?)").run(namespace, taskId, link.id, position++, url, link.title.trim());
          urls.add(url);
          changed = true;
        }
        for (const note of input.notes) {
          database.prepare("INSERT INTO task_notes VALUES (?,?,?,?,?)").run(namespace, taskId, note.id, note.title.trim(), note.content);
          changed = true;
        }
        for (const file of files) {
          const result = database.prepare("INSERT INTO task_file_references VALUES (?,?,?,?,?,?) ON CONFLICT(namespace,task_id,path) DO NOTHING").run(namespace, taskId, file.id, file.name, file.path, file.size);
          if (result.changes) changed = true;
        }
        if (changed) this.touchTask(database, taskId);
        database.prepare("INSERT INTO task_resource_batches VALUES (?,?,?)").run(namespace, taskId, input.requestId);
      }
      database.exec("COMMIT");
      transactionOpen = false;
    } catch (error) { if (transactionOpen) database.exec("ROLLBACK"); throw error; }
    finally { database.close(); }
  }
  async mutateNote(taskId: string, noteId: string, note: TaskNote | null) {
    const database = await openAppDatabase(this.filename);
    let transactionOpen = false;
    try {
      database.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      const task = database.prepare("SELECT status FROM tasks WHERE namespace=? AND id=?").get(this.namespace, taskId);
      if (!task) throw new Error("TASK_NOT_FOUND");
      if (task.status === "ARCHIVED" || database.prepare("SELECT 1 FROM task_deletions WHERE namespace=? AND task_id=?").get(this.namespace, taskId)) throw new Error("TASK_BUSY");
      const current = database.prepare("SELECT title,content FROM task_notes WHERE namespace=? AND task_id=? AND id=?").get(this.namespace, taskId, noteId);
      if (!current) throw new Error("TASK_NOTE_NOT_FOUND");
      if (note) {
        if (current.title !== note.title.trim() || current.content !== note.content) {
          database.prepare("UPDATE task_notes SET title=?,content=? WHERE namespace=? AND task_id=? AND id=?").run(note.title.trim(), note.content, this.namespace, taskId, noteId);
          this.touchTask(database, taskId);
        }
      } else {
        database.prepare("DELETE FROM task_notes WHERE namespace=? AND task_id=? AND id=?").run(this.namespace, taskId, noteId);
        this.touchTask(database, taskId);
      }
      database.exec("COMMIT");
      transactionOpen = false;
    } catch (error) { if (transactionOpen) database.exec("ROLLBACK"); throw error; }
    finally { database.close(); }
  }
  private touchTask(database: DatabaseSync, taskId: string) {
    database.prepare("UPDATE tasks SET updated_at=? WHERE namespace=? AND id=?").run(new Date().toISOString(), this.namespace, taskId);
  }
}
