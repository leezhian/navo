import { open, readFile, readdir, realpath, stat } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TraceProvider } from "../../../src/shared/extensionTypes";

export interface SourceSession {
  id: string;
  provider: TraceProvider;
  root: string;
  cwd: string;
  createdAt: string;
}
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";
async function contained(filename: string, root: string) {
  const actual = await realpath(filename).catch((error) => {
    throw missing(error) ? Error("SOURCE_MISSING") : error;
  });
  if (!actual.startsWith(root + path.sep)) throw Error("SOURCE_INVALID");
  return actual;
}
async function verify(filename: string, session: SourceSession, root: string) {
  const actual = await contained(filename, root),
    file = await open(actual, "r");
  try {
    const info = await file.stat();
    if (!info.isFile()) throw Error("SOURCE_INVALID");
    const bytes = Buffer.alloc(Math.min(info.size, 1024 * 1024));
    await file.read(bytes, 0, bytes.length, 0);
    const lines = bytes
      .toString("utf8")
      .split("\n")
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
    // Grok、Antigravity 的记录行不含会话身份，路径本身按精确 ID 拼出，另由目录元数据核对。
    const valid =
      session.provider === "grok" || session.provider === "antigravity"
        ? true
        : session.provider === "codex"
        ? lines.some((row) => row.type === "session_meta" && row.payload?.id === session.id && row.payload?.cwd === session.cwd)
        : lines.some((row) => row.sessionId === session.id && row.cwd === session.cwd);
    if (!valid) throw Error("SOURCE_INVALID");
    return actual;
  } finally {
    await file.close();
  }
}
/** 会话日志目录不存在时与“目录在但文件缺失”区分，界面提示无法定位日志目录。 */
async function requireDirectory(directory: string) {
  const info = await stat(directory).catch(() => null);
  if (!info?.isDirectory()) throw Error("SOURCE_ROOT_MISSING");
}
/** Grok：sessions/<encodeURIComponent(cwd)>/<id>/chat_history.jsonl；summary.json 存在时核对 id 与 cwd。 */
async function grokSource(session: SourceSession, root: string) {
  const directory = path.join(root, "sessions", encodeURIComponent(session.cwd), session.id);
  await requireDirectory(directory);
  const summary = await readFile(path.join(directory, "summary.json"), "utf8").catch(() => null);
  if (summary !== null) {
    let info: { id?: unknown; cwd?: unknown } | undefined;
    try {
      info = JSON.parse(summary)?.info;
    } catch {
      info = undefined; // 正在写入的摘要暂不可读，路径已按精确 ID 与目录拼出。
    }
    if (info && (info.id !== session.id || info.cwd !== session.cwd)) throw Error("SOURCE_INVALID");
  }
  return verify(path.join(directory, "chat_history.jsonl"), session, root);
}
/** Antigravity：brain/<id>/.system_generated/logs 下优先 transcript_full.jsonl；会话库中该 ID 的工作区必须包含当前目录。 */
async function antigravitySource(session: SourceSession, root: string) {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(path.join(root, "conversation_summaries.db"), { readOnly: true });
    const row = db.prepare("SELECT workspace_uris FROM conversation_summaries WHERE conversation_id=?").get(session.id);
    if (row) {
      const uris: unknown = JSON.parse(String(row.workspace_uris));
      const matches = Array.isArray(uris) && uris.some((uri) => {
        try {
          return typeof uri === "string" && fileURLToPath(uri) === session.cwd;
        } catch {
          return false;
        }
      });
      if (!matches) throw Error("SOURCE_INVALID");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "SOURCE_INVALID") throw error;
    // 会话库暂不可读时不阻塞查看，日志路径本身按精确 ID 拼出。
  } finally {
    db?.close();
  }
  const directory = path.join(root, "brain", session.id, ".system_generated", "logs");
  await requireDirectory(directory);
  for (const name of ["transcript_full.jsonl", "transcript.jsonl"]) {
    try {
      return await verify(path.join(directory, name), session, root);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "SOURCE_MISSING") throw error;
    }
  }
  throw Error("SOURCE_MISSING");
}
/** 仅按精确 ID 查询；旧 Codex 的目录回退限制为会话创建日期附近，不递归扫描用户目录。 */
export async function resolveSource(session: SourceSession) {
  if (!/^[a-f0-9-]{36}$/i.test(session.id) || !path.isAbsolute(session.cwd) || !path.isAbsolute(session.root))
    throw Error("SOURCE_INVALID");
  const root = await realpath(session.root).catch(() => {
    throw Error("SOURCE_ROOT_MISSING");
  });
  if (session.provider === "grok") return grokSource(session, root);
  if (session.provider === "antigravity") return antigravitySource(session, root);
  if (session.provider === "claude")
    return verify(path.join(root, "projects", session.cwd.replace(/[^a-zA-Z0-9]/g, "-"), session.id + ".jsonl"), session, root);
  const files = await readdir(root);
  const database = files
    .filter((name) => /^state_\d+\.sqlite$/.test(name))
    .sort((a, b) => Number(b.match(/\d+/)?.[0]) - Number(a.match(/\d+/)?.[0]))[0];
  if (database) {
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(await contained(path.join(root, database), root), { readOnly: true });
      const row = db.prepare("SELECT rollout_path FROM threads WHERE id=? AND cwd=?").get(session.id, session.cwd);
      if (typeof row?.rollout_path === "string") return await verify(path.resolve(root, row.rollout_path), session, root);
    } catch (error) {
      if (error instanceof Error && error.message === "SOURCE_INVALID") throw error;
    } finally {
      db?.close();
    }
  }
  for (const delta of [-1, 0, 1]) {
    const date = new Date(Date.parse(session.createdAt) + delta * 86400000).toISOString().slice(0, 10).replace(/-/g, "/");
    for (const prefix of ["sessions", "archived_sessions"]) {
      const directory = prefix === "sessions" ? path.join(root, prefix, date) : path.join(root, prefix);
      const names = await readdir(directory).catch(() => []);
      const matches = names.filter((name) => name.endsWith(session.id + ".jsonl"));
      if (matches.length === 1) return verify(path.join(directory, matches[0]), session, root);
    }
  }
  throw Error("SOURCE_MISSING");
}
