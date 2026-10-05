import type { DatabaseSync } from "node:sqlite";
import { isLegacyDemoIssue, isLegacyDemoTask } from "../../../shared/legacyDemoRecords";

/** 调用方负责事务。仅清理已知演示指纹，保留修改过或含真实上下文的任务。 */
export function removeLegacyDemoRecords(database: DatabaseSync) {
  const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => String(row.name)));
  let removedTasks = 0;
  let removedLinks = 0;
  if (tables.has("task_links")) {
    for (const row of database.prepare("SELECT namespace,task_id,link_id,data FROM task_links").all()) {
      let value: unknown;
      try { value = JSON.parse(String(row.data)); } catch { continue; }
      if (!isLegacyDemoIssue(value)) continue;
      removedLinks += Number(database.prepare("DELETE FROM task_links WHERE namespace=? AND task_id=? AND link_id=? AND data=?")
        .run(row.namespace, row.task_id, row.link_id, row.data).changes);
    }
  }
  if (tables.has("tasks")) {
    for (const row of database.prepare("SELECT namespace,id,title,date,project_name,description FROM tasks WHERE id GLOB 'task-[0-9][0-9]'").all()) {
      if (!isLegacyDemoTask({ id: row.id, title: row.title, date: row.date, projectName: row.project_name, description: row.description })) continue;
      const hasContext = ["task_resources", "task_links", "task_web_links", "task_attachments", "task_deletions", "managed_workspaces"]
        .filter((table) => tables.has(table))
        .some((table) => database.prepare(`SELECT 1 FROM ${table} WHERE namespace=? AND task_id=? LIMIT 1`).get(row.namespace, row.id));
      if (hasContext || (tables.has("task_operations") && database.prepare("SELECT 1 FROM task_operations WHERE namespace=? AND id=?").get(row.namespace, row.id))) continue;
      removedTasks += Number(database.prepare("DELETE FROM tasks WHERE namespace=? AND id=?").run(row.namespace, row.id).changes);
    }
  }
  return { removedTasks, removedLinks };
}
