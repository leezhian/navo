import { open, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { TaskSession } from "../../../shared/taskSessionTypes";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_HEADER_BYTES = 1024 * 1024;
interface NativeSession { id: string; title?: string }

/** 只用于首条任务指令的关联元信息；恢复时不重复交付，不携带凭据。 */
export function nativeLaunchReference(id: string) { return `Navo conversation reference: ${id}`; }

async function readHeader(filename: string) {
  const file = await open(filename, "r");
  try {
    const size = (await file.stat()).size;
    const buffer = Buffer.alloc(Math.min(MAX_HEADER_BYTES, size));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8").split("\n").flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } finally { await file.close(); }
}

function readRows(filename: string, query: string, ...parameters: string[]) {
  let database: DatabaseSync | undefined;
  try { database = new DatabaseSync(filename, { readOnly: true });return database.prepare(query).all(...parameters); }
  catch { return []; } // 原生库未创建、版本不支持或暂时被占用时不猜测 ID。
  finally { database?.close(); }
}

async function codexSessions(session: TaskSession, root: string): Promise<NativeSession[]> {
  const files = await readdir(root);
  const database = files.filter((file) => /^state_\d+\.sqlite$/.test(file)).sort((a, b) => Number(b.match(/\d+/)?.[0]) - Number(a.match(/\d+/)?.[0]))[0];
  const reference = session.nativeLaunchId && nativeLaunchReference(session.nativeLaunchId);
  if (database) {
    const rows = session.resumable && session.nativeSessionId
      ? readRows(path.join(root, database), "SELECT id,title FROM threads WHERE id=? AND cwd=? AND archived=0", session.nativeSessionId, session.cwd)
      : reference ? readRows(path.join(root, database), "SELECT id,title FROM threads WHERE cwd=? AND instr(first_user_message,?)>0 AND archived=0 LIMIT 2", session.cwd, reference) : [];
    if (rows.length) return rows.filter((row) => typeof row.id === "string" && UUID.test(row.id)).map((row) => ({ id: String(row.id), title: String(row.title ?? "") }));
  }
  if (!reference || session.resumable) return [];
  // 兼容仍使用 JSONL 的 CLI；仅检查本次启动日期附近的记录并核对首条用户输入。
  const found: NativeSession[] = [];
  for (const offset of [-1, 0, 1]) {
    const date = new Date(Date.parse(session.nativeLaunchAt ?? session.createdAt) + offset * 86400000).toISOString().slice(0, 10).replace(/-/g, "/");
    const directory = path.join(root, "sessions", date);
    const candidates = await readdir(directory).catch(() => []);
    for (const file of candidates.filter((name) => name.endsWith(".jsonl"))) {
      const rows = await readHeader(path.join(directory, file)).catch(() => []);
      const meta = rows.find((row) => row.type === "session_meta")?.payload;
      if (!meta || meta.cwd !== session.cwd || typeof meta.id !== "string" || !UUID.test(meta.id)) continue;
      if (rows.some((row) => row.type === "response_item" && row.payload?.type === "message" && row.payload.role === "user"
        && JSON.stringify(row.payload.content ?? "").includes(reference))) found.push({ id: meta.id });
    }
  }
  return found;
}

async function antigravitySessions(session: TaskSession, root: string): Promise<NativeSession[]> {
  const rows = readRows(path.join(root, "conversation_summaries.db"),
    "SELECT conversation_id,title,workspace_uris,last_modified_time FROM conversation_summaries WHERE instr(workspace_uris,?)>0 AND COALESCE(app_data_dir,'') IN ('','antigravity-cli') ORDER BY last_modified_time DESC LIMIT 128",
    pathToFileURL(session.cwd).href);
  const matches: NativeSession[] = [];
  for (const row of rows) {
    const id = String(row.conversation_id);
    if (!UUID.test(id)) continue;
    let workspaces: unknown;
    try { workspaces = JSON.parse(String(row.workspace_uris)); } catch { continue; }
    if (!Array.isArray(workspaces) || !workspaces.some((uri) => {
      try { return typeof uri === "string" && fileURLToPath(uri) === session.cwd; } catch { return false; }
    })) continue;
    if (session.resumable && session.nativeSessionId === id) return [{ id, title: String(row.title ?? "") }];
    if (session.resumable || !session.nativeLaunchId) continue;
    if (Date.parse(String(row.last_modified_time)) < Date.parse(session.nativeLaunchAt ?? session.createdAt) - 60000) continue;
    for (const filename of ["transcript_full.jsonl", "transcript.jsonl"]) {
      const records = await readHeader(path.join(root, "brain", id, ".system_generated", "logs", filename)).catch(() => []);
      const firstUser = records.find((record) => record.type === "USER_INPUT");
      if (JSON.stringify(firstUser?.content ?? "").includes(nativeLaunchReference(session.nativeLaunchId))) {
        matches.push({ id, title: String(row.title ?? "") });break;
      }
    }
  }
  return matches;
}

/** 唯一关联标识 + 实际目录同时匹配才绑定；多候选、缺记录均不取“最近会话”。 */
export async function readNativeSessionBinding(session: TaskSession): Promise<NativeSession | null> {
  if (!session.nativeHistoryRoot || !path.isAbsolute(session.cwd) || (!session.nativeLaunchId && !session.resumable)) return null;
  try {
    const matches = session.agent?.agentId === "codex" ? await codexSessions(session, session.nativeHistoryRoot)
      : session.agent?.agentId === "antigravity" ? await antigravitySessions(session, session.nativeHistoryRoot) : [];
    return matches.length === 1 ? matches[0] : null;
  } catch { return null; }
}
