import type { DatabaseSync } from "node:sqlite";
import type { Task } from "../../domain/tasks";
import type { TaskAttachment, TaskResource } from "../../shared/taskTypes";
import type { TaskDeletionProgress } from "../../shared/taskDeletionTypes";
import { openAppDatabase } from "./appDatabase";
import { writeDiagnosticEvent } from "../diagnostics/diagnosticLogger";
import { readTaskExtraResources } from "./taskResourceRepository";
import { insertInitialization, readInitialization } from "./taskInitializationRepository";
import type { StoredInitializationStep } from "./taskInitializationRepository";
import { recordTaskNoteVersion } from "./taskNoteHistory";
import { TASK_PROMPT_ID } from "../../shared/taskContextTypes";
import { readTaskNoteComments } from "./taskNoteComments";

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
      const promptSnapshot = database.prepare("SELECT actor,session_id,created_at FROM task_note_history WHERE namespace=? AND task_id=? AND note_id=? AND version=?").get(this.namespace, taskId, TASK_PROMPT_ID, Number(row.prompt_version));
      const agent = database.prepare("SELECT data FROM task_agents WHERE namespace = ? AND task_id = ?").get(this.namespace, taskId);
      const resources = database.prepare("SELECT data FROM task_resources WHERE namespace = ? AND task_id = ? ORDER BY position").all(this.namespace, taskId);
      const links = database.prepare("SELECT data FROM task_links WHERE namespace = ? AND task_id = ? ORDER BY rowid").all(this.namespace, taskId);
      const webLinks = database.prepare("SELECT id,url,title FROM task_web_links WHERE namespace = ? AND task_id = ? ORDER BY position").all(this.namespace, taskId);
      const attachments = database.prepare("SELECT id,name,size FROM task_attachments WHERE namespace = ? AND task_id = ? ORDER BY rowid").all(this.namespace, taskId);
      return {
        ...readTaskExtraResources(database, this.namespace, taskId),
        ...(agent ? { agent: JSON.parse(String(agent.data)) } : {}),
        id: taskId, title: String(row.title), description: String(row.description), date: String(row.date),
        updatedAt: String(row.updated_at),
        contextVersion: Number(row.context_version),
        promptVersion: Number(row.prompt_version),
        ...(promptSnapshot ? { promptMetadata: { updatedAt: String(promptSnapshot.created_at), lastEditor: promptSnapshot.actor as "user" | "agent" | "unknown", ...(promptSnapshot.session_id ? { lastEditorSessionId: String(promptSnapshot.session_id) } : {}) } } : {}),
        promptComments: readTaskNoteComments(database, this.namespace, taskId, TASK_PROMPT_ID),
        initialization: readInitialization(database, this.namespace, taskId),
        projectName: String(row.project_name), status: row.status as Task["status"],
        archivedFrom: row.archived_from === "TODO" || row.archived_from === "DONE" ? row.archived_from : undefined,
        resources: resources.map((item) => JSON.parse(String(item.data))),
        links: links.map((item) => JSON.parse(String(item.data))),
        webLinks: webLinks.map((item) => ({ id: String(item.id), url: String(item.url), title: String(item.title) })),
        attachments: attachments.map((item) => ({ id: String(item.id), name: String(item.name), size: Number(item.size) })),
      };
    });
  }

  load(): Promise<Task[] | null> {
    return this.access((database) => database.prepare("SELECT 1 FROM task_state WHERE namespace = ?").get(this.namespace) ? this.readTasks(database) : null);
  }

  private insert(database: DatabaseSync, task: Task, position: number) {
    database.prepare("INSERT INTO tasks (namespace,id,title,description,date,project_name,status,archived_from,position,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(this.namespace, task.id, task.title, task.description ?? "", task.date, task.projectName, task.status, task.archivedFrom ?? null, position, task.updatedAt || task.date);
    recordTaskNoteVersion(database, this.namespace, task.id, TASK_PROMPT_ID, "create");
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

  create(task: Task, attachments: StoredAttachment[], initialization: StoredInitializationStep[] = []): Promise<void> {
    return this.access((database) => transaction(database, () => {
      database.prepare("UPDATE tasks SET position = position + 1 WHERE namespace = ?").run(this.namespace);
      this.insert(database, task, 0);
      insertInitialization(database, this.namespace, task.id, initialization);
      if (task.agent) database.prepare("INSERT INTO task_agents VALUES (?,?,?)").run(this.namespace, task.id, JSON.stringify(task.agent));
      task.resources?.forEach((resource, position) => {
        database.prepare("INSERT INTO task_resources VALUES (?,?,?,?)").run(this.namespace, task.id, position, JSON.stringify(resource));
        if (resource.mode === "worktree" && resource.ownership) database.prepare("INSERT INTO managed_workspaces VALUES (?,?,?,?,?)")
          .run(this.namespace, task.id, resource.workingPath, resource.targetBranch, resource.originalPath);
      });
      for (const link of task.links ?? []) database.prepare("INSERT INTO task_links VALUES (?,?,?,?)").run(this.namespace, task.id, link.id, JSON.stringify(link));
      task.webLinks?.forEach((link, position) => {
        database.prepare("INSERT INTO task_web_links VALUES (?,?,?,?,?,?)").run(this.namespace, task.id, link.id, position, link.url, link.title);
      });
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
      const updatedAt = new Date().toISOString();
      next.forEach((task, position) => database.prepare(`UPDATE tasks SET
        context_version = context_version + CASE WHEN title IS NOT ? THEN 1 ELSE 0 END,
        updated_at = CASE WHEN title IS NOT ? OR status IS NOT ? OR archived_from IS NOT ? THEN ? ELSE updated_at END,
        title = ?,status = ?,archived_from = ?,position = ? WHERE namespace = ? AND id = ?`)
        .run(task.title, task.title, task.status, task.archivedFrom ?? null, updatedAt,
          task.title, task.status, task.archivedFrom ?? null, position, this.namespace, task.id));
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

  deletionContext(taskId: string) {
    return this.access((database) => ({
      owned: database.prepare("SELECT path,branch,repository FROM managed_workspaces WHERE namespace = ? AND task_id = ?")
        .all(this.namespace, taskId).map((row) => ({ path: String(row.path), branch: String(row.branch), repository: String(row.repository) })),
      references: database.prepare("SELECT r.namespace,r.task_id,t.title,r.data FROM task_resources r JOIN tasks t ON t.namespace=r.namespace AND t.id=r.task_id")
        .all().map((row) => ({ namespace: String(row.namespace), taskId: String(row.task_id), title: String(row.title), resource: JSON.parse(String(row.data)) as TaskResource })),
      progress: database.prepare("SELECT data FROM task_deletions WHERE namespace = ? AND task_id = ?")
        .all(this.namespace, taskId).map((row) => JSON.parse(String(row.data)) as TaskDeletionProgress),
    }));
  }

  recordDeletion(taskId: string, progress: TaskDeletionProgress) {
    return this.access((database) => {
      database.prepare("INSERT INTO task_deletions VALUES (?,?,?,?) ON CONFLICT(namespace,task_id,resource_id) DO UPDATE SET data=excluded.data")
        .run(this.namespace, taskId, progress.resourceId, JSON.stringify(progress));
    });
  }

  /** 清理完成后保留任务、资源路径和会话历史；撤销已删目录的归属，恢复任务不会重建目录。 */
  completeArchival(taskId: string, beforeTaskId: string | null = null): Promise<Task[]> {
    return this.access((database) => transaction(database, () => {
      const tasks = this.readTasks(database);
      const task = tasks.find((item) => item.id === taskId);
      if (!task) throw new Error("TASK_NOT_FOUND");
      if (beforeTaskId !== null && beforeTaskId !== taskId && !tasks.some((item) => item.id === beforeTaskId && item.status === "ARCHIVED")) throw new Error("TASK_INVALID");
      const completed = database.prepare("SELECT resource_id,data FROM task_deletions WHERE namespace=? AND task_id=?").all(this.namespace, taskId);
      const resources = database.prepare("SELECT position,data FROM task_resources WHERE namespace=? AND task_id=?").all(this.namespace, taskId);
      for (const row of completed) {
        if ((JSON.parse(String(row.data)) as TaskDeletionProgress).worktree !== "removed") continue;
        const stored = resources.find((item) => (JSON.parse(String(item.data)) as TaskResource).resourceId === row.resource_id);
        if (!stored) continue;
        const resource: TaskResource = JSON.parse(String(stored.data));
        delete resource.ownership;
        database.prepare("UPDATE task_resources SET data=? WHERE namespace=? AND task_id=? AND position=?").run(JSON.stringify(resource), this.namespace, taskId, stored.position);
        database.prepare("DELETE FROM managed_workspaces WHERE namespace=? AND task_id=? AND path=?").run(this.namespace, taskId, resource.workingPath);
      }
      database.prepare("DELETE FROM task_deletions WHERE namespace=? AND task_id=?").run(this.namespace, taskId);
      const next = tasks.filter((item) => item.id !== taskId);
      const before = beforeTaskId ? next.findIndex((item) => item.id === beforeTaskId) : -1;
      const lastArchived = next.map((item) => item.status).lastIndexOf("ARCHIVED");
      next.splice(before >= 0 ? before : lastArchived >= 0 ? lastArchived + 1 : next.length, 0, task);
      next.forEach((item, position) => database.prepare("UPDATE tasks SET position=? WHERE namespace=? AND id=?").run(position, this.namespace, item.id));
      database.prepare("UPDATE tasks SET archived_from=CASE WHEN status='ARCHIVED' THEN archived_from ELSE status END,status='ARCHIVED',updated_at=? WHERE namespace=? AND id=?")
        .run(new Date().toISOString(), this.namespace, taskId);
      return this.readTasks(database);
    }));
  }

  completeDeletion(taskId: string): Promise<Task[]> {
    return this.access((database) => transaction(database, () => {
      const completed = database.prepare("SELECT resource_id,data FROM task_deletions WHERE namespace = ? AND task_id = ?").all(this.namespace, taskId);
      const resources = database.prepare("SELECT data FROM task_resources WHERE namespace = ? AND task_id = ?").all(this.namespace, taskId)
        .map((row) => JSON.parse(String(row.data)) as TaskResource);
      for (const row of completed) {
        if ((JSON.parse(String(row.data)) as TaskDeletionProgress).worktree !== "removed") continue;
        const resource = resources.find((item) => item.resourceId === row.resource_id);
        if (resource) database.prepare("DELETE FROM managed_workspaces WHERE namespace = ? AND task_id = ? AND path = ?")
          .run(this.namespace, taskId, resource.workingPath);
      }
      database.prepare("DELETE FROM tasks WHERE namespace = ? AND id = ?").run(this.namespace, taskId);
      return this.readTasks(database);
    }));
  }
}

function transaction<Result>(database: DatabaseSync, operation: () => Result): Result {
  database.exec("BEGIN IMMEDIATE");
  try { const result = operation(); database.exec("COMMIT"); return result; }
  catch (error) {
    void writeDiagnosticEvent("database.transaction_failed", { error });
    database.exec("ROLLBACK"); throw error;
  }
}
