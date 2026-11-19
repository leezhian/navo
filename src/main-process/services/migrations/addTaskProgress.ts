import type { DatabaseSync } from "node:sqlite";

export function addTaskProgress(database: DatabaseSync) {
  if (database.prepare("PRAGMA table_info(tasks)").all().some((row) => row.name === "progress")) return;
  database.exec("ALTER TABLE tasks ADD COLUMN progress TEXT");
  // 已完成的旧任务视为用户手动完成；升级不能根据缺失的 Git 信号重新打开它们。
  database.prepare("UPDATE tasks SET progress=? WHERE status='DONE' OR (status='ARCHIVED' AND archived_from='DONE')")
    .run(JSON.stringify({ evidence: "exploration", manual: { stage: "done", evidence: null } }));
}
