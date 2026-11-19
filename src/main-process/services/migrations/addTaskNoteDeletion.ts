import type { DatabaseSync } from "node:sqlite";

/** 旧记录保持活动/归档状态；升级前已物理删除的内容无法补造。 */
export function addTaskNoteDeletion(database: DatabaseSync) {
  if (!database.prepare("PRAGMA table_info(task_notes)").all().some((row) => row.name === "deleted_at")) {
    database.exec("ALTER TABLE task_notes ADD COLUMN deleted_at TEXT");
  }
}
