import type { TaskSession } from "../../../shared/taskSessionTypes";
import { openAppDatabase } from "../appDatabase";

export class SessionRepository {
  constructor(private readonly filename: string, private readonly namespace: string) {}
  async load(): Promise<TaskSession[]> {
    const database = await openAppDatabase(this.filename);
    try {
      return database.prepare("SELECT data FROM task_sessions WHERE namespace = ? ORDER BY rowid").all(this.namespace)
        .map((row) => JSON.parse(String(row.data)) as TaskSession);
    } finally { database.close(); }
  }
  async save(session: TaskSession) {
    if (session.kind !== "agent") return;
    const database = await openAppDatabase(this.filename);
    try {
      database.prepare("INSERT INTO task_sessions(namespace,task_id,id,data) VALUES(?,?,?,?) ON CONFLICT(namespace,id) DO UPDATE SET data=excluded.data")
        .run(this.namespace, session.taskId, session.id, JSON.stringify(session));
    } finally { database.close(); }
  }
  async remove(id: string) {
    const database = await openAppDatabase(this.filename);
    try { database.prepare("DELETE FROM task_sessions WHERE namespace = ? AND id = ?").run(this.namespace, id); }
    finally { database.close(); }
  }
}
