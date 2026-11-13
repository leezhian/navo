import type { DatabaseSync } from "node:sqlite";

/** 既有笔记只建立当前版本基线，保留原时间；不推测缺失的历史或编辑者。 */
export function addTaskNoteCollaboration(database: DatabaseSync) {
  if (!database.prepare("PRAGMA table_info(tasks)").all().some((row) => row.name === "prompt_version")) {
    database.exec("ALTER TABLE tasks ADD COLUMN prompt_version INTEGER NOT NULL DEFAULT 1");
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS task_note_history (
      namespace TEXT NOT NULL,task_id TEXT NOT NULL,note_id TEXT NOT NULL,version INTEGER NOT NULL,
      title TEXT NOT NULL,content TEXT NOT NULL,kind TEXT NOT NULL,actor TEXT NOT NULL,session_id TEXT,
      created_at TEXT NOT NULL,restored_from INTEGER,
      PRIMARY KEY(namespace,task_id,note_id,version),
      FOREIGN KEY(namespace,task_id) REFERENCES tasks(namespace,id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS task_note_comments (
      namespace TEXT NOT NULL,task_id TEXT NOT NULL,note_id TEXT NOT NULL,id TEXT NOT NULL,
      note_version INTEGER NOT NULL,start_line INTEGER NOT NULL,end_line INTEGER NOT NULL,
      quote TEXT NOT NULL,body TEXT NOT NULL,parent_id TEXT,actor TEXT NOT NULL,session_id TEXT,
      resolved_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
      PRIMARY KEY(namespace,task_id,id),
      FOREIGN KEY(namespace,task_id) REFERENCES tasks(namespace,id) ON DELETE CASCADE
    );
    INSERT OR IGNORE INTO task_note_history
      SELECT namespace,task_id,id,version,title,content,'baseline',CASE WHEN version=1 THEN origin ELSE 'unknown' END,
        CASE WHEN version=1 THEN session_id ELSE NULL END,updated_at,NULL FROM task_notes;
    INSERT OR IGNORE INTO task_note_history
      SELECT namespace,id,'task-prompt',prompt_version,'Prompt',description,'baseline','unknown',NULL,updated_at,NULL FROM tasks;
  `);
}
