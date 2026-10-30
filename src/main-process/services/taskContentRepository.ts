import type { DatabaseSync } from "node:sqlite";
import type { TaskResourceRemoval } from "../../shared/taskContextTypes";
import type { TaskResource } from "../../shared/taskTypes";
import { openAppDatabase } from "./appDatabase";

/** 所有内容修改在同一事务中校验归档/删除状态并递增上下文版本。 */
export class TaskContentRepository {
  constructor(private readonly filename: string, private readonly namespace: string) {}
  private async mutate(taskId: string, operation: (database: DatabaseSync) => boolean) {
    if (typeof taskId !== "string") throw new Error("TASK_INVALID");
    const database = await openAppDatabase(this.filename);
    try {
      database.exec("BEGIN IMMEDIATE");
      const task = database.prepare("SELECT status FROM tasks WHERE namespace=? AND id=?").get(this.namespace, taskId);
      if (!task) throw new Error("TASK_NOT_FOUND");
      if (task.status === "ARCHIVED" || database.prepare("SELECT 1 FROM task_deletions WHERE namespace=? AND task_id=?").get(this.namespace, taskId)) throw new Error("TASK_BUSY");
      if (operation(database)) database.prepare("UPDATE tasks SET updated_at=?,context_version=context_version+1 WHERE namespace=? AND id=?").run(new Date().toISOString(), this.namespace, taskId);
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); throw error; }
    finally { database.close(); }
  }
  updatePrompt(taskId: string, content: string, expected: string) {
    if (typeof content !== "string" || !content.trim() || content.length > 100000 || typeof expected !== "string") throw new Error("TASK_INVALID");
    return this.mutate(taskId, (database) => {
      const row = database.prepare("SELECT description FROM tasks WHERE namespace=? AND id=?").get(this.namespace, taskId);
      if (row?.description !== expected) throw new Error("TASK_CONTENT_CHANGED");
      if (row.description === content) return false;
      database.prepare("UPDATE tasks SET description=? WHERE namespace=? AND id=?").run(content, this.namespace, taskId);
      return true;
    });
  }
  detach(taskId: string, input: TaskResourceRemoval) {
    if (!input || typeof input.id !== "string") throw new Error("TASK_INVALID");
    return this.mutate(taskId, (database) => {
      if (input.kind === "workspace") {
        const row = database.prepare("SELECT position,data FROM task_resources WHERE namespace=? AND task_id=?").all(this.namespace, taskId)
          .find((item) => (JSON.parse(String(item.data)) as TaskResource).resourceId === input.id);
        if (!row) throw new Error("TASK_RESOURCE_CHANGED");
        const resource: TaskResource = JSON.parse(String(row.data));
        // 解除关联仅撤销归属，不删除磁盘目录、Git 分支或 Worktree 锁。
        database.prepare("DELETE FROM task_resources WHERE namespace=? AND task_id=? AND position=?").run(this.namespace, taskId, row.position);
        database.prepare("DELETE FROM managed_workspaces WHERE namespace=? AND task_id=? AND path=?").run(this.namespace, taskId, resource.workingPath);
        for (const step of database.prepare("SELECT id,data FROM task_initialization WHERE namespace=? AND task_id=?").all(this.namespace, taskId)) {
          if (JSON.parse(String(step.data)).resourceId === input.id) database.prepare("DELETE FROM task_initialization WHERE namespace=? AND task_id=? AND id=?").run(this.namespace, taskId, step.id);
        }
        const first = database.prepare("SELECT data FROM task_resources WHERE namespace=? AND task_id=? ORDER BY position LIMIT 1").get(this.namespace, taskId);
        database.prepare("UPDATE tasks SET project_name=? WHERE namespace=? AND id=?").run(first ? JSON.parse(String(first.data)).name : "", this.namespace, taskId);
        return true;
      }
      const tables = { issue: ["task_links", "link_id"], link: ["task_web_links", "id"], file: ["task_file_references", "id"], attachment: ["task_attachments", "id"] } as const;
      if (!Object.prototype.hasOwnProperty.call(tables, input.kind)) throw new Error("TASK_INVALID");
      const [table, key] = tables[input.kind];
      // 表名只来自上述固定映射；附件的私有副本随任务删除清理，原文件永不删除。
      return Boolean(database.prepare(`DELETE FROM ${table} WHERE namespace=? AND task_id=? AND ${key}=?`).run(this.namespace, taskId, input.id).changes);
    });
  }
}
