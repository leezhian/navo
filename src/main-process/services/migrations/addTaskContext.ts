import type { DatabaseSync } from "node:sqlite";

export function addTaskContext(database: DatabaseSync) {
  const columns = database.prepare("PRAGMA table_info(tasks)").all();
  if (!columns.some((column) => column.name === "context_version")) database.exec("ALTER TABLE tasks ADD COLUMN context_version INTEGER NOT NULL DEFAULT 1");
  database.exec(`CREATE TABLE IF NOT EXISTS task_initialization (
    namespace TEXT NOT NULL, task_id TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY(namespace,task_id,id),
    FOREIGN KEY(namespace,task_id) REFERENCES tasks(namespace,id) ON DELETE CASCADE
  )`);
}
