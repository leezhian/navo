import type { DatabaseSync } from "node:sqlite";
import type { Task } from "../../domain/tasks";
import type { TaskAttachment } from "../../shared/taskTypes";
import { openAppDatabase } from "./appDatabase";

export interface StoredAttachment extends TaskAttachment {
  storageName: string;
}

export class TaskRepository {
  constructor(private readonly filePath: string, readonly namespace: string) {}

  private async access<Result>(operation: (database: DatabaseSync) => Result): Promise<Result> {
    const database = await openAppDatabase(this.filePath);
    try { return operation(database); } finally { database.close(); }
  }

  private readTasks(database: DatabaseSync): Task[] {
    const rows = database.prepare("SELECT * FROM tasks WHERE namespace = ? ORDER BY position, id").all(this.namespace);
    return rows.map((row) => {
      const taskId = String(row.id);
      const resources = database.prepare("SELECT data FROM task_resources WHERE namespace = ? AND task_id = ? ORDER BY position").all(this.namespace, taskId);
      const links = database.prepare("SELECT data FROM task_links WHERE namespace = ? AND task_id = ? ORDER BY rowid").all(this.namespace, taskId);
      const attachments = database.prepare("SELECT id,name,size FROM task_attachments WHERE namespace = ? AND task_id = ? ORDER BY rowid").all(this.namespace, taskId);
      return {
        id: taskId, title: String(row.title), description: String(row.description), date: String(row.date),
        projectName: String(row.project_name), status: row.status as Task["status"],
        archivedFrom: row.archived_from === "TODO" || row.archived_from === "DONE" ? row.archived_from : undefined,
        resources: resources.map((item) => JSON.parse(String(item.data))),
        links: links.map((item) => JSON.parse(String(item.data))),
        attachments: attachments.map((item) => ({ id: String(item.id), name: String(item.name), size: Number(item.size) })),
      };
    });
  }

  load(): Promise<Task[] | null> {
    return this.access((database) => database.prepare("SELECT 1 FROM task_state WHERE namespace = ?").get(this.namespace) ? this.readTasks(database) : null);
  }

  private insert(database: DatabaseSync, task: Task, position: number) {
    database.prepare("INSERT INTO tasks (namespace,id,title,description,date,project_name,status,archived_from,position) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(this.namespace, task.id, task.title, task.description ?? "", task.date, task.projectName, task.status, task.archivedFrom ?? null, position);
  }

  importLegacy(tasks: Task[]): Promise<Task[]> {
    return this.access((database) => transaction(database, () => {
      if (!database.prepare("SELECT 1 FROM task_state WHERE namespace = ?").get(this.namespace)) {
        tasks.forEach((task, position) => this.insert(database, task, position));
        database.prepare("INSERT INTO task_state VALUES (?,1)").run(this.namespace);
      }
      return this.readTasks(database);
    }));
  }

  create(task: Task, attachments: StoredAttachment[]): Promise<void> {
    return this.access((database) => transaction(database, () => {
      database.prepare("UPDATE tasks SET position = position + 1 WHERE namespace = ?").run(this.namespace);
      this.insert(database, task, 0);
      task.resources?.forEach((resource, position) => {
        database.prepare("INSERT INTO task_resources VALUES (?,?,?,?)").run(this.namespace, task.id, position, JSON.stringify(resource));
        if (resource.mode === "worktree") database.prepare("INSERT INTO managed_workspaces VALUES (?,?,?,?,?)")
          .run(this.namespace, task.id, resource.workingPath, resource.targetBranch, resource.originalPath);
      });
      for (const link of task.links ?? []) database.prepare("INSERT INTO task_links VALUES (?,?,?,?)").run(this.namespace, task.id, link.id, JSON.stringify(link));
      for (const file of attachments) database.prepare("INSERT INTO task_attachments VALUES (?,?,?,?,?,?)")
        .run(this.namespace, task.id, file.id, file.name, file.size, file.storageName);
      database.prepare("INSERT OR IGNORE INTO task_state VALUES (?,1)").run(this.namespace);
      database.prepare("DELETE FROM task_operations WHERE namespace = ? AND id = ?").run(this.namespace, task.id);
    }));
  }

  update(operation: (tasks: Task[]) => Task[]): Promise<Task[]> {
    return this.access((database) => transaction(database, () => {
      const current = this.readTasks(database);
      const next = operation(current);
      const identifiers = new Set(next.map((task) => task.id));
      for (const task of current) if (!identifiers.has(task.id)) database.prepare("DELETE FROM tasks WHERE namespace = ? AND id = ?").run(this.namespace, task.id);
      next.forEach((task, position) => database.prepare("UPDATE tasks SET title = ?,status = ?,archived_from = ?,position = ? WHERE namespace = ? AND id = ?")
        .run(task.title, task.status, task.archivedFrom ?? null, position, this.namespace, task.id));
      return this.readTasks(database);
    }));
  }

  attachment(taskId: string, attachmentId: string): Promise<string | null> {
    return this.access((database) => {
      const row = database.prepare("SELECT storage_name FROM task_attachments WHERE namespace = ? AND task_id = ? AND id = ?").get(this.namespace, taskId, attachmentId);
      return row ? String(row.storage_name) : null;
    });
  }

  recordOperation(id: string, state: "pending" | "retained", manifest: unknown): Promise<void> {
    return this.access((database) => {
      database.prepare("INSERT INTO task_operations VALUES (?,?,?,?) ON CONFLICT(namespace,id) DO UPDATE SET state=excluded.state,manifest=excluded.manifest")
        .run(this.namespace, id, state, JSON.stringify(manifest));
    });
  }

  operations(): Promise<Array<{ id: string; state: string; manifest: string }>> {
    return this.access((database) => database.prepare("SELECT id,state,manifest FROM task_operations WHERE namespace = ?").all(this.namespace)
      .map((row) => ({ id: String(row.id), state: String(row.state), manifest: String(row.manifest) })));
  }

  clearOperation(id: string): Promise<void> {
    return this.access((database) => { database.prepare("DELETE FROM task_operations WHERE namespace = ? AND id = ?").run(this.namespace, id); });
  }
}

function transaction<Result>(database: DatabaseSync, operation: () => Result): Result {
  database.exec("BEGIN IMMEDIATE");
  try { const result = operation(); database.exec("COMMIT"); return result; }
  catch (error) { database.exec("ROLLBACK"); throw error; }
}
