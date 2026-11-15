import type { DatabaseSync } from "node:sqlite";

function hasColumn(database: DatabaseSync, table: string, column: string) {
  return database.prepare(`PRAGMA table_info(${table})`).all().some((entry) => entry.name === column);
}

/** 为笔记、原文件、附件和普通链接增加资源级归档；文件与附件可填写描述。升级不改写既有内容。 */
export function addTaskResourceArchive(database: DatabaseSync) {
  if (!hasColumn(database, "task_notes", "archived_at")) database.exec("ALTER TABLE task_notes ADD COLUMN archived_at TEXT");
  if (!hasColumn(database, "task_file_references", "archived_at")) database.exec("ALTER TABLE task_file_references ADD COLUMN archived_at TEXT");
  if (!hasColumn(database, "task_file_references", "description")) database.exec("ALTER TABLE task_file_references ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  if (!hasColumn(database, "task_attachments", "archived_at")) database.exec("ALTER TABLE task_attachments ADD COLUMN archived_at TEXT");
  if (!hasColumn(database, "task_attachments", "description")) database.exec("ALTER TABLE task_attachments ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  if (!hasColumn(database, "task_web_links", "archived_at")) database.exec("ALTER TABLE task_web_links ADD COLUMN archived_at TEXT");
}
