import type { DatabaseSync } from "node:sqlite";
import type { TaskResource } from "../../shared/taskTypes";

/** 记录仓库而非任务内的工作区；解除关联或删除任务不能抹去使用历史。 */
export function recordRepositoryUsage(database: DatabaseSync, namespace: string, resource: TaskResource) {
  database.prepare(`INSERT INTO repository_usage (namespace, repository_id, last_used_at) VALUES (?, ?, ?)
    ON CONFLICT(namespace, repository_id) DO UPDATE SET last_used_at = excluded.last_used_at
    WHERE excluded.last_used_at IS NOT NULL AND (last_used_at IS NULL OR excluded.last_used_at > last_used_at)`)
    .run(namespace, resource.repositoryId ?? resource.resourceId, resource.addedAt ?? null);
}

export function initializeRepositoryUsage(database: DatabaseSync) {
  database.exec(`CREATE TABLE IF NOT EXISTS repository_usage (
    namespace TEXT NOT NULL, repository_id TEXT NOT NULL, last_used_at TEXT, PRIMARY KEY(namespace, repository_id))`);
  for (const row of database.prepare("SELECT namespace, data FROM task_resources").all()) {
    const resource: TaskResource = JSON.parse(String(row.data));
    recordRepositoryUsage(database, String(row.namespace), resource);
  }
}

export function readRepositoryUsage(database: DatabaseSync, namespace: string) {
  return new Map(database.prepare("SELECT repository_id, last_used_at FROM repository_usage WHERE namespace=?").all(namespace)
    .map((row) => [String(row.repository_id), row.last_used_at === null ? null : String(row.last_used_at)]));
}
