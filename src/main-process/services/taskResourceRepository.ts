import type { DatabaseSync } from "node:sqlite";
import type { AddTaskResourcesInput, TaskFileReference, TaskNote } from "../../shared/taskResourceTypes";
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
  async append(taskId: string, input: AddTaskResourcesInput, files: TaskFileReference[]) {
    const database = await openAppDatabase(this.filename);
    const namespace = this.namespace;
    let transactionOpen = false;
    try {
      database.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      if (!database.prepare("SELECT 1 FROM tasks WHERE namespace=? AND id=?").get(namespace, taskId)) throw new Error("TASK_NOT_FOUND");
      if (!database.prepare("SELECT 1 FROM task_resource_batches WHERE namespace=? AND task_id=? AND request_id=?").get(namespace, taskId, input.requestId)) {
        for (const link of input.links) {
          const existing = database.prepare("SELECT data FROM task_links WHERE namespace=? AND task_id=? AND link_id=?").get(namespace, taskId, link.id);
          if (existing && JSON.parse(String(existing.data)).group !== link.group) throw new Error("TASK_INVALID");
          if (!existing) database.prepare("INSERT INTO task_links VALUES (?,?,?,?)").run(namespace, taskId, link.id, JSON.stringify(link));
        }
        const urls = new Set(database.prepare("SELECT url FROM task_web_links WHERE namespace=? AND task_id=?").all(namespace, taskId).map((row) => new URL(String(row.url)).href));
        let position = Number(database.prepare("SELECT COALESCE(MAX(position),-1)+1 AS next FROM task_web_links WHERE namespace=? AND task_id=?").get(namespace, taskId)?.next);
        for (const link of input.webLinks) {
          const url = new URL(link.url).href;
          if (urls.has(url)) continue;
          database.prepare("INSERT INTO task_web_links VALUES (?,?,?,?,?,?)").run(namespace, taskId, link.id, position++, url, link.title.trim());
          urls.add(url);
        }
        for (const note of input.notes) database.prepare("INSERT INTO task_notes VALUES (?,?,?,?,?)").run(namespace, taskId, note.id, note.title.trim(), note.content);
        for (const file of files) database.prepare("INSERT INTO task_file_references VALUES (?,?,?,?,?,?) ON CONFLICT(namespace,task_id,path) DO NOTHING").run(namespace, taskId, file.id, file.name, file.path, file.size);
        database.prepare("INSERT INTO task_resource_batches VALUES (?,?,?)").run(namespace, taskId, input.requestId);
      }
      database.exec("COMMIT");
      transactionOpen = false;
    } catch (error) { if (transactionOpen) database.exec("ROLLBACK"); throw error; }
    finally { database.close(); }
  }
}
