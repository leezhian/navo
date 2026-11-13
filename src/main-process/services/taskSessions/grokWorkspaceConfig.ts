import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NAVO_TASK_SERVER, NAVO_TASK_TOKEN_ENV, assertTaskContextUrl } from "./taskMcpGuards";

const GROK_BLOCK_BEGIN = "# navo-task-context:begin";
const GROK_BLOCK_END = "# navo-task-context:end";
const GROK_BLOCK_PATTERN = /\n?# navo-task-context:begin[\s\S]*?# navo-task-context:end\n?/g;
const DEFAULT_CONFIG_MODE = 0o644;

/** 合并带标记的项目 MCP。凭证只留环境变量名，拒绝覆盖用户自己的 navo_task。 */
export function mergeGrokTaskBlock(source: string, url: string) {
  const block = [
    GROK_BLOCK_BEGIN,
    `[mcp_servers.${NAVO_TASK_SERVER}]`,
    `url = ${JSON.stringify(assertTaskContextUrl(url))}`,
    "enabled = true",
    `bearer_token_env_var = "${NAVO_TASK_TOKEN_ENV}"`,
    GROK_BLOCK_END,
    "",
  ].join("\n");
  const stripped = source.replace(GROK_BLOCK_PATTERN, "\n");
  if (stripped.includes(`[mcp_servers.${NAVO_TASK_SERVER}`)) throw new Error("SESSION_CONTEXT_UNAVAILABLE");
  const body = stripped.trim();
  return `${body ? `${body}\n\n` : ""}${block}`;
}

export function stripGrokTaskBlock(source: string) {
  const stripped = source.replace(GROK_BLOCK_PATTERN, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return stripped ? `${stripped}\n` : "";
}

/** 写入项目配置并返回工作目录真实路径，供同一目录的多个会话计数。 */
export async function attachGrokWorkspace(cwd: string, url: string) {
  const root = await prepareGrokRoot(cwd);
  await writeGrokConfig(root, url);
  return root;
}

/** 去掉标记段。指向目录外的软链保持原样，避免清理时改到仓库外面。 */
export async function detachGrokWorkspace(root: string) {
  const directory = path.join(root, ".grok");
  let resolved: string;
  try { resolved = await realpath(directory); }
  catch (error) { if (isMissing(error)) return; throw error; }
  if (!staysInside(root, resolved)) return;
  let located: LocatedConfig;
  try { located = await locateConfig(root); }
  catch (error) { if (error instanceof Error && error.message === "SESSION_CONTEXT_UNAVAILABLE") return; throw error; }
  if (!located.existing) return;
  const next = stripGrokTaskBlock(located.existing);
  if (!next.trim()) await unlink(located.file).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  else if (next !== located.existing) await writeAtomic(located.file, next, located.mode);
}

async function prepareGrokRoot(cwd: string) {
  const root = await realpath(cwd);
  const directory = path.join(root, ".grok");
  await mkdir(directory, { recursive: true });
  const resolved = await realpath(directory);
  // 工作区里的 .grok 软链不能把配置写到仓库外面。
  if (!staysInside(root, resolved)) throw new Error("SESSION_CONTEXT_UNAVAILABLE");
  return root;
}

async function writeGrokConfig(root: string, url: string) {
  const located = await locateConfig(root);
  const next = mergeGrokTaskBlock(located.existing, url);
  if (next !== located.existing) await writeAtomic(located.file, next, located.mode);
}

interface LocatedConfig {
  /** 实际写入的文件。软链时这是目标，不是链接本身。 */
  file: string;
  mode: number;
  existing: string;
}

/**
 * 目录内的 config.toml 软链可以跟随，但目标必须仍在这个 .grok 里。
 * 直接对链接路径做 rename 会把链接换成普通文件，所以写到 realpath。
 */
async function locateConfig(root: string): Promise<LocatedConfig> {
  const link = path.join(root, ".grok", "config.toml");
  const grokDir = await realpath(path.join(root, ".grok"));
  let target = link;
  try {
    const info = await lstat(link);
    if (info.isSymbolicLink()) {
      let resolved: string;
      try { resolved = await realpath(link); }
      catch (error) { if (isMissing(error)) throw new Error("SESSION_CONTEXT_UNAVAILABLE"); throw error; }
      if (!staysInside(grokDir, resolved)) throw new Error("SESSION_CONTEXT_UNAVAILABLE");
      target = resolved;
    } else if (!info.isFile()) throw new Error("SESSION_CONTEXT_UNAVAILABLE");
  } catch (error) {
    if (isMissing(error)) return { file: link, mode: DEFAULT_CONFIG_MODE, existing: "" };
    throw error;
  }
  const info = await stat(target);
  if (!info.isFile()) throw new Error("SESSION_CONTEXT_UNAVAILABLE");
  const existing = await readFile(target, "utf8");
  if (existing.includes("\u0000")) throw new Error("SESSION_CONTEXT_UNAVAILABLE");
  return { file: target, mode: info.mode & 0o777, existing };
}

function staysInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function writeAtomic(file: string, content: string, mode: number) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  await writeFile(temporary, content, { mode });
  try { await rename(temporary, file); }
  catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
  await chmod(file, mode);
}
