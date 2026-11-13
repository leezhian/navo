import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, realpath, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NAVO_TASK_SERVER, assertTaskContextToken, assertTaskContextUrl } from "./taskMcpGuards";

/** 插件目录仅所有者可进入。 */
export const PLUGIN_DIRECTORY_MODE = 0o700;
/** 插件文件含本次凭证，仅所有者可读写。 */
export const PLUGIN_FILE_MODE = 0o600;
export const ANTIGRAVITY_ADD_DIR_FLAG = "--add-dir";

const PLUGIN_NAME = "navo";
const PLUGIN_VERSION = "1.0.0";
const PLUGIN_DESCRIPTION = "Navo workspace tools for this session.";
const PLUGIN_JSON = [".agents", "plugins", PLUGIN_NAME, "plugin.json"] as const;
const MCP_JSON = [".agents", "plugins", PLUGIN_NAME, "mcp_config.json"] as const;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
/** 旧实现写在用户数据目录里的父进程登记，里面有凭证。新路径不再使用，启动时清掉。 */
const LEGACY_REGISTRY_DIRECTORY = "task-mcp-registry";

export interface AntigravityPluginLaunch {
  /** 已确认仍在 pluginRoot 内的会话目录。 */
  dir: string;
  args: string[];
}

/** Antigravity 1.5.3 起才用 --add-dir 加载会话目录里的插件。帮助里没有就不接入。 */
export function helpOffersAddDir(help: string) {
  return help.includes(ANTIGRAVITY_ADD_DIR_FLAG);
}

/**
 * 在应用私有目录写本次会话的插件。凭证只在这个 0700 目录里，不进用户 MCP 配置，也不进进程环境。
 * 目录或文件写失败时删掉本次目录并抛出，调用方退回文件模式。
 */
export async function writeAntigravityPlugin(pluginRoot: string, sessionId: string, url: string, token: string): Promise<AntigravityPluginLaunch> {
  assertSessionId(sessionId);
  const checkedUrl = assertTaskContextUrl(url);
  const checkedToken = assertTaskContextToken(token);
  await mkdir(pluginRoot, { recursive: true, mode: PLUGIN_DIRECTORY_MODE });
  await chmod(pluginRoot, PLUGIN_DIRECTORY_MODE);
  const root = await realpath(pluginRoot);
  await removeSessionDir(root, sessionId);
  const dir = path.join(root, sessionId);
  await mkdir(dir, { mode: PLUGIN_DIRECTORY_MODE });
  try {
    await chmod(dir, PLUGIN_DIRECTORY_MODE);
    const resolved = await realpath(dir);
    assertDirectChild(root, resolved, sessionId);
    const plugin = `${JSON.stringify({ name: PLUGIN_NAME, version: PLUGIN_VERSION, description: PLUGIN_DESCRIPTION }, null, 2)}\n`;
    const mcp = `${JSON.stringify({ mcpServers: { [NAVO_TASK_SERVER]: { url: checkedUrl, headers: { Authorization: `Bearer ${checkedToken}` } } } }, null, 2)}\n`;
    await writeAtomic(containedFile(resolved, PLUGIN_JSON), plugin, PLUGIN_FILE_MODE);
    await writeAtomic(containedFile(resolved, MCP_JSON), mcp, PLUGIN_FILE_MODE);
    return { dir: resolved, args: [ANTIGRAVITY_ADD_DIR_FLAG, resolved] };
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

/** 只删除仍在 pluginRoot 内的会话目录。清理失败由调用方吞掉，不因此让停止失败。 */
export async function removeAntigravityPlugin(pluginRoot: string, sessionId: string) {
  if (!SESSION_ID_PATTERN.test(sessionId)) return;
  let root: string;
  try { root = await realpath(pluginRoot); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  await removeSessionDir(root, sessionId);
}

/** 启动和退出时清掉崩溃留下的私有目录，避免凭证文件留在磁盘上。不跟随指向别处的软链。 */
export async function reapAntigravityPlugins(pluginRoot: string | undefined) {
  if (!pluginRoot) return;
  await removeOwnedDirectory(pluginRoot);
  await removeOwnedDirectory(path.join(path.dirname(pluginRoot), LEGACY_REGISTRY_DIRECTORY));
}

async function removeOwnedDirectory(directory: string) {
  let info;
  try { info = await lstat(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  if (info.isSymbolicLink() || !info.isDirectory()) return;
  await rm(directory, { recursive: true, force: true });
}

function assertSessionId(sessionId: string) {
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error("SESSION_CONTEXT_UNAVAILABLE");
}

async function removeSessionDir(root: string, sessionId: string) {
  const dir = path.join(root, sessionId);
  let info;
  try { info = await lstat(dir); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  // 软链可能指向仓库或用户目录，删除前不能跟随。
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("SESSION_CONTEXT_UNAVAILABLE");
  const resolved = await realpath(dir);
  assertDirectChild(root, resolved, sessionId);
  await rm(resolved, { recursive: true, force: true });
}

function assertDirectChild(parent: string, child: string, name: string) {
  const relative = path.relative(parent, child);
  if (relative !== name || path.isAbsolute(relative)) throw new Error("SESSION_CONTEXT_UNAVAILABLE");
}

function containedFile(dir: string, parts: readonly string[]) {
  const file = path.resolve(dir, ...parts);
  const relative = path.relative(dir, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("SESSION_CONTEXT_UNAVAILABLE");
  return file;
}

async function writeAtomic(file: string, content: string, mode: number) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  await writeFile(temporary, content, { mode });
  try { await rename(temporary, file); }
  catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
  await chmod(file, mode);
}
