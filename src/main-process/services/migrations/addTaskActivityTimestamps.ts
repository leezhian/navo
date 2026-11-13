import type { DatabaseSync } from "node:sqlite";
import { parseStoredSession } from "../taskSessions/sessionValidation";

export function addTaskActivityTimestamps(database: DatabaseSync) {
  if (!database.prepare("PRAGMA table_info(tasks)").all().some((column) => column.name === "updated_at")) {
    database.exec("ALTER TABLE tasks ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  }
  database.exec("UPDATE tasks SET updated_at = date WHERE updated_at = ''");
  const update = database.prepare("UPDATE task_sessions SET data = ? WHERE namespace = ? AND id = ?");
  for (const row of database.prepare("SELECT namespace,task_id,id,data FROM task_sessions").all()) {
    const session = parseStoredSession(String(row.data), String(row.id), String(row.task_id));
    if (!session) continue;
    // 旧记录没有活动轨迹，只回填已知时间，不能把升级时间当成最近活动。
    const data = JSON.stringify(session);
    if (data !== row.data) update.run(data, row.namespace, row.id);
  }
}
