import type { DatabaseSync } from "node:sqlite";

/** 增加平台连接、Issue 缓存和自动关联排除表；升级不改写既有任务数据。 */
export function addIntegrations(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS integration_connections (
      id TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS integration_secrets (
      id TEXT PRIMARY KEY NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      FOREIGN KEY(id) REFERENCES integration_connections(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS issue_cache (
      id TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      source TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS issue_list_state (
      scope_key TEXT PRIMARY KEY NOT NULL,
      item_ids TEXT NOT NULL,
      fetched_at TEXT,
      stale INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS issue_autolink_exclusions (
      namespace TEXT NOT NULL,
      task_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      PRIMARY KEY(namespace, task_id, issue_id)
    );
  `);
}
