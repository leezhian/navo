import type { DatabaseSync } from "node:sqlite";

/** 旧笔记沿用任务已有时间和插入顺序，升级不制造新的用户活动。 */
export function addTaskNoteMetadata(database: DatabaseSync) {
  const columns = database.prepare("PRAGMA table_info(task_notes)").all();
  if (columns.some((column) => column.name === "version")) return;
  database.exec(`
    ALTER TABLE task_notes ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE task_notes ADD COLUMN origin TEXT NOT NULL DEFAULT 'user';
    ALTER TABLE task_notes ADD COLUMN session_id TEXT;
    ALTER TABLE task_notes ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE task_notes ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
    ALTER TABLE task_notes ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
  `);
  const rows = database.prepare(`SELECT n.rowid AS note_rowid, n.namespace, n.task_id, t.date, t.updated_at
    FROM task_notes n JOIN tasks t ON t.namespace=n.namespace AND t.id=n.task_id
    ORDER BY n.namespace,n.task_id,n.rowid`).all();
  const update = database.prepare("UPDATE task_notes SET sort_order=?,created_at=?,updated_at=? WHERE rowid=?");
  let previousNamespace: unknown, previousTask: unknown, order = 0;
  for (const row of rows) {
    if (row.namespace !== previousNamespace || row.task_id !== previousTask) order = 0;
    update.run(order++, row.date, row.updated_at || row.date, row.note_rowid);
    previousNamespace = row.namespace; previousTask = row.task_id;
  }
}
