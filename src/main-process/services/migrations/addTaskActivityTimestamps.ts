import type { DatabaseSync } from "node:sqlite";
import type { TaskSession } from "../../../shared/taskSessionTypes";

export function addTaskActivityTimestamps(database: DatabaseSync) {
  if (!database.prepare("PRAGMA table_info(tasks)").all().some((column) => column.name === "updated_at")) {
    database.exec("ALTER TABLE tasks ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  }
  database.exec("UPDATE tasks SET updated_at = date WHERE updated_at = ''");
  const update = database.prepare("UPDATE task_sessions SET data = ? WHERE namespace = ? AND id = ?");
  for (const row of database.prepare("SELECT namespace,id,data FROM task_sessions").all()) {
    const session = JSON.parse(String(row.data)) as TaskSession;
    if (session.lastUpdateAt && session.lastActiveAt) continue;
    // 旧记录没有活动轨迹，只回填已知时间，不能把升级时间当成最近活动。
    session.lastUpdateAt ||= session.archivedAt || session.createdAt;
    session.lastActiveAt ||= session.createdAt;
    update.run(JSON.stringify(session), row.namespace, row.id);
  }
}
