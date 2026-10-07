import { constants } from "node:fs";
import { lstat, open, readFile, realpath, rename, rm, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import type { TaskSession } from "../../../shared/taskSessionTypes";
import type { AgentService } from "../agents/agentService";
import { agentShellEnvironment, findAgentBinary, isAgentExecutable, runAgentProbe } from "../agents/agentEnvironment";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_METADATA_BYTES = 256 * 1024;

export function canManageNativeSession(session: TaskSession) {
  return session.kind === "agent" && Boolean(session.nativeSessionId && UUID.test(session.nativeSessionId))
    && (session.agent?.agentId === "grok" || session.agent?.agentId === "claude");
}

export function requireSessionName(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 160
    || Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new Error("SESSION_INVALID_NAME");
}

async function nativeDirectory(session: TaskSession, env: NodeJS.ProcessEnv) {
  if (!canManageNativeSession(session) || !path.isAbsolute(session.cwd)) throw new Error("SESSION_NATIVE_UNSUPPORTED");
  const grok = session.agent?.agentId === "grok";
  const rootPath = session.nativeHistoryRoot || (grok ? env.GROK_HOME || path.join(os.homedir(), ".grok") : env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"));
  if (!path.isAbsolute(rootPath)) throw new Error("SESSION_NATIVE_MISSING");
  const root = await realpath(rootPath);
  const directory = grok ? path.join(root, "sessions", encodeURIComponent(session.cwd), session.nativeSessionId as string)
    : path.join(root, "projects", session.cwd.replace(/[^a-zA-Z0-9]/g, "-"));
  if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory) throw new Error("SESSION_NATIVE_CHANGED");
  return directory;
}

async function nativeLocation(session: TaskSession, env: NodeJS.ProcessEnv) {
  const directory = await nativeDirectory(session, env);
  const grok = session.agent?.agentId === "grok";
  const filename = path.join(directory, grok ? "summary.json" : session.nativeSessionId + ".jsonl");
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("SESSION_NATIVE_CHANGED");
  if (grok) {
    if (info.size > MAX_METADATA_BYTES) throw new Error("SESSION_NATIVE_CHANGED");
    const data = JSON.parse(await readFile(filename, "utf8"));
    if (data.info?.id !== session.nativeSessionId || data.info?.cwd !== session.cwd) throw new Error("SESSION_NATIVE_CHANGED");
    return { directory, filename, info, data };
  }
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const buffer = Buffer.alloc(Math.min(info.size, MAX_METADATA_BYTES));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const matched = buffer.subarray(0, bytesRead).toString("utf8").split("\n").some((line) => {
      try { return JSON.parse(line).sessionId === session.nativeSessionId; } catch { return false; }
    });
    if (!matched) throw new Error("SESSION_NATIVE_CHANGED");
  } finally { await file.close(); }
  return { directory, filename, info, data: null };
}

async function unchanged(location: Awaited<ReturnType<typeof nativeLocation>>) {
  const current = await lstat(location.filename);
  if (current.isSymbolicLink() || current.ino !== location.info.ino || current.dev !== location.info.dev
    || current.size !== location.info.size || current.mtimeMs !== location.info.mtimeMs) throw new Error("SESSION_NATIVE_CHANGED");
}

async function removeClaudeIndexEntry(directory: string, sessionId: string) {
  const filename = path.join(directory, "sessions-index.json");
  let info;
  try { info = await lstat(filename); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) throw new Error("SESSION_NATIVE_CHANGED");
  const data = JSON.parse(await readFile(filename, "utf8"));
  if (!Array.isArray(data.entries)) throw new Error("SESSION_NATIVE_CHANGED");
  const entries = data.entries.filter((entry: { sessionId?: unknown }) => entry.sessionId !== sessionId);
  if (entries.length === data.entries.length) return;
  const temporary = path.join(directory, `.navo-index-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify({ ...data, entries }), { flag: "wx", mode: 0o600 });
    const current = await lstat(filename);
    if (current.isSymbolicLink() || current.ino !== info.ino || current.mtimeMs !== info.mtimeMs || current.size !== info.size) throw new Error("SESSION_NATIVE_CHANGED");
    await rename(temporary, filename);
  } finally { await rm(temporary, { force: true }); }
}

/** 调用前停止 Navo 管理的进程，避免正在写入的 CLI 覆盖改名；只改精确原生记录。 */
export async function renameNativeSession(session: TaskSession, name: string, env: NodeJS.ProcessEnv) {
  requireSessionName(name);
  const location = await nativeLocation(session, env);
  if (session.agent?.agentId === "grok") {
    const temporary = path.join(location.directory, `.navo-title-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify({ ...location.data, generated_title: name.trim() }, null, 2), { flag: "wx", mode: 0o600 });
      await unchanged(location);
      await rename(temporary, location.filename);
    } finally { await rm(temporary, { force: true }); }
  } else {
    await unchanged(location);
    const file = await open(location.filename, constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (info.ino !== location.info.ino || info.dev !== location.info.dev || info.size !== location.info.size) throw new Error("SESSION_NATIVE_CHANGED");
      const last = Buffer.alloc(1);
      if (info.size) await file.read(last, 0, 1, info.size - 1);
      const prefix = info.size && last[0] !== 10 ? "\n" : "";
      await file.writeFile(prefix + JSON.stringify({ type: "custom-title", customTitle: name.trim(), sessionId: session.nativeSessionId }) + "\n");
      await file.sync();
    } finally { await file.close(); }
  }
}

export async function removeNativeSession(session: TaskSession, env: NodeJS.ProcessEnv, grokBinary?: string) {
  let location: Awaited<ReturnType<typeof nativeLocation>>;
  try { location = await nativeLocation(session, env); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    let directory: string;
    try { directory = await nativeDirectory(session, env); }
    catch (missing) { if ((missing as NodeJS.ErrnoException).code === "ENOENT") return; throw missing; }
    // 主记录缺失不等于历史已清理；无法验证残留记录归属时保留 Navo 条目。
    if (session.agent?.agentId === "grok") throw new Error("SESSION_NATIVE_MISSING");
    try { await lstat(path.join(directory, session.nativeSessionId as string)); }
    catch (missing) {
      if ((missing as NodeJS.ErrnoException).code !== "ENOENT") throw missing;
      await removeClaudeIndexEntry(directory, session.nativeSessionId as string);
      return;
    }
    throw new Error("SESSION_NATIVE_MISSING");
  }
  if (session.agent?.agentId === "grok") {
    if (!grokBinary) throw new Error("AGENT_UNAVAILABLE");
    const help = await runAgentProbe(grokBinary, ["sessions", "delete", "--help"], env);
    if (help.code !== 0 || !/sessions delete/.test(help.stdout + help.stderr)) throw new Error("SESSION_NATIVE_UNSUPPORTED");
    await unchanged(location);
    const result = await runAgentProbe(grokBinary, ["sessions", "delete", session.nativeSessionId as string], env, 15000);
    if (result.code !== 0) throw new Error("SESSION_NATIVE_DELETE_FAILED");
    try { await lstat(location.directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    throw new Error("SESSION_NATIVE_DELETE_FAILED");
  }
  const sidecar = path.join(location.directory, session.nativeSessionId as string);
  await unchanged(location);
  await removeClaudeIndexEntry(location.directory, session.nativeSessionId as string);
  try {
    const info = await lstat(sidecar);
    if (info.isDirectory() && !info.isSymbolicLink() && await realpath(sidecar) === sidecar) await rm(sidecar, { recursive: true });
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await unchanged(location);
  await unlink(location.filename);
}

/** 从已保存配置解析原生根目录及二进制；不执行登录或模型查询。 */
export async function nativeActionEnvironment(agents: AgentService, session: TaskSession) {
  if (!canManageNativeSession(session)) throw new Error("SESSION_NATIVE_UNSUPPORTED");
  const config = (await agents.repository.read()).configurations.find((item) => item.id === session.agent?.agentId);
  if (!config) throw new Error("AGENT_UNAVAILABLE");
  const env = { ...await agentShellEnvironment(), ...agents.repository.environment(config) };
  if (session.nativeHistoryRoot) env[session.agent?.agentId === "grok" ? "GROK_HOME" : "CLAUDE_CONFIG_DIR"] = session.nativeHistoryRoot;
  const grokBinary = session.agent?.agentId === "grok" ? config.customPath || (await findAgentBinary("grok", env))?.filename : undefined;
  if (grokBinary && !await isAgentExecutable(grokBinary)) throw new Error("AGENT_UNAVAILABLE");
  return { env, grokBinary };
}
