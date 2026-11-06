import { open, readdir, realpath } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

export interface SourceSession {
  id: string;
  provider: "claude" | "codex";
  root: string;
  cwd: string;
  createdAt: string;
}
async function contained(filename: string, root: string) {
  const actual = await realpath(filename);
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
    const valid =
      session.provider === "codex"
        ? lines.some((row) => row.type === "session_meta" && row.payload?.id === session.id && row.payload?.cwd === session.cwd)
        : lines.some((row) => row.sessionId === session.id && row.cwd === session.cwd);
    if (!valid) throw Error("SOURCE_INVALID");
    return actual;
  } finally {
    await file.close();
  }
}
/** 仅按精确 ID 查询；旧 Codex 的目录回退限制为会话创建日期附近，不递归扫描用户目录。 */
export async function resolveSource(session: SourceSession) {
  if (!/^[a-f0-9-]{36}$/i.test(session.id) || !path.isAbsolute(session.cwd) || !path.isAbsolute(session.root))
    throw Error("SOURCE_INVALID");
  const root = await realpath(session.root);
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
