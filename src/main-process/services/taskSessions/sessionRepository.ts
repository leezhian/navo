import type { TaskSession } from "../../../shared/taskSessionTypes";
import { isDeepStrictEqual } from "node:util";
import { openAppDatabase } from "../appDatabase";
import { parseStoredSession } from "./sessionValidation";
import { writeDiagnosticEvent } from "../../diagnostics/diagnosticLogger";

export class SessionRepository {
  constructor(private readonly filename: string, private readonly namespace: string) {}
  async load(): Promise<TaskSession[]> {
    const database = await openAppDatabase(this.filename);
    try {
      const rows = database.prepare("SELECT id,task_id,data FROM task_sessions WHERE namespace = ? ORDER BY rowid").all(this.namespace);
      const sessions = rows.flatMap((row) => {
        const session = parseStoredSession(String(row.data), String(row.id), String(row.task_id));
        return session ? [session] : [];
      });
      // 保留磁盘现场供修复；日志只记录数量，不包含原始 JSON、名称或路径。
      if (sessions.length !== rows.length) void writeDiagnosticEvent("session.records_invalid", { count: rows.length - sessions.length });
      return sessions;
    } finally { database.close(); }
  }
  async save(session: TaskSession, options: { preserveUpdateTime?: boolean } = {}) {
    if (session.kind !== "agent") return;
    const database = await openAppDatabase(this.filename);
    try {
      const row = database.prepare("SELECT data FROM task_sessions WHERE namespace = ? AND id = ?").get(this.namespace, session.id);
      const previous = row ? JSON.parse(String(row.data)) as TaskSession : undefined;
      const metadataChanged = previous && !isDeepStrictEqual(sessionMetadata(previous), sessionMetadata(session));
      const lastUpdateAt = !options.preserveUpdateTime && metadataChanged
        ? new Date().toISOString() : session.lastUpdateAt || session.archivedAt || session.createdAt;
      // 运行相位与等待原因只在内存中，不写库；回复时间不算元数据变更。
      const persisted = { ...session };
      delete persisted.phase; delete persisted.waitingReason;
      const stored = { ...persisted, lastUpdateAt, lastActiveAt: session.lastActiveAt || session.createdAt };
      database.prepare("INSERT INTO task_sessions(namespace,task_id,id,data) VALUES(?,?,?,?) ON CONFLICT(namespace,id) DO UPDATE SET data=excluded.data")
        .run(this.namespace, session.taskId, session.id, JSON.stringify(stored));
      session.lastUpdateAt = stored.lastUpdateAt;
      session.lastActiveAt = stored.lastActiveAt;
    } finally { database.close(); }
  }
  async remove(id: string) {
    const database = await openAppDatabase(this.filename);
    try { database.prepare("DELETE FROM task_sessions WHERE namespace = ? AND id = ?").run(this.namespace, id); }
    finally { database.close(); }
  }
}

function sessionMetadata(session: TaskSession) {
  return JSON.parse(JSON.stringify({ ...session, lastUpdateAt: undefined, lastActiveAt: undefined, lastReplyAt: undefined, phase: undefined, waitingReason: undefined }));
}
