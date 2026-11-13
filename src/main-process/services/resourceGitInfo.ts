import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath, stat } from "node:fs/promises";
import type { ResourceGitInfo } from "../../shared/settingsTypes";
import { resolveResourcePath } from "./resourcePaths";
import { getResourceGitBaseFiles, getResourceGitConfigFiles, getResourceGitFingerprint } from "./resourceGitConfigFiles";

const execute = promisify(execFile);
const CACHE_LIMIT = 100;
interface CachedResourceGitInfo {
  info: ResourceGitInfo;
  files: string[];
  fingerprint: string;
}
const cache = new Map<string, CachedResourceGitInfo>();
const pending = new Map<string, { request: Promise<ResourceGitInfo>; forced: boolean }>();

async function readGit(directory: string, args: string[]) {
  return execute("git", args, { cwd: directory, encoding: "utf8", timeout: 5000, maxBuffer: 64 * 1024,
    env: { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" } });
}

export function sanitizeResourceRemote(value: string) {
  const remote = value.trim();
  if (!remote || remote.length > 8192 || Array.from(remote).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(remote);
    if (!url.hostname) return remote;
    if (url.protocol !== "ssh:") url.username = "";
    url.password = ""; url.search = ""; url.hash = "";
    return url.toString();
  } catch { return remote.replace(/^[^@]*:[^@]*@/, "[redacted]@"); }
}

/** 只读本地配置，不连接服务商、不 fetch，也不执行资源中的脚本。 */
export async function inspectResourceGit(localPath: string, forceRefresh = false): Promise<ResourceGitInfo> {
  if (typeof localPath !== "string" || localPath.length > 4096 || localPath.includes("\0")) throw new Error("INVALID_DIRECTORY");
  const directory = await realpath(resolveResourcePath(localPath));
  if (!(await stat(directory)).isDirectory()) throw new Error("INVALID_DIRECTORY");
  const existing = pending.get(directory);
  if (existing) {
    if (forceRefresh === true && !existing.forced) {
      await existing.request.catch(() => undefined);
      return inspectResourceGit(localPath, true);
    }
    return existing.request;
  }
  const request = loadResourceGitInfo(directory, forceRefresh === true);
  pending.set(directory, { request, forced: forceRefresh === true });
  try { return await request; }
  finally { if (pending.get(directory)?.request === request) pending.delete(directory); }
}

async function loadResourceGitInfo(directory: string, forceRefresh: boolean): Promise<ResourceGitInfo> {
  const previous = cache.get(directory);
  if (!forceRefresh && previous && await getResourceGitFingerprint(previous.files) === previous.fingerprint) return previous.info;
  const baseFiles = getResourceGitBaseFiles(directory);
  const baseFingerprint = await getResourceGitFingerprint(baseFiles);
  try {
    const gitDirectories = await readGit(directory, ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"]);
    const configuration = await readGit(directory, ["config", "--null", "--show-origin", "--list"]);
    const files = getResourceGitConfigFiles(directory, gitDirectories.stdout, configuration.stdout);
    const fingerprint = await getResourceGitFingerprint(files);
    const { stdout } = await readGit(directory, ["remote"]);
    const remotes = stdout.trim().split(/\r?\n/).filter(Boolean);
    const selected = remotes.includes("origin") ? "origin" : remotes[0];
    const result = selected ? await readGit(directory, ["remote", "get-url", "--", selected]) : null;
    const info = { isRepository: true, remoteUrl: result ? sanitizeResourceRemote(result.stdout) : null };
    if (await getResourceGitFingerprint(files) === fingerprint && await getResourceGitFingerprint(baseFiles) === baseFingerprint) remember(directory, { info, files, fingerprint });
    return info;
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: string };
    if (failure.code === "ENOENT") throw new Error("GIT_UNAVAILABLE");
    if (/^fatal: not a git repository\b/m.test(failure.stderr ?? "")) {
      const info = { isRepository: false, remoteUrl: null };
      if (await getResourceGitFingerprint(baseFiles) === baseFingerprint) remember(directory, { info, files: baseFiles, fingerprint: baseFingerprint });
      return info;
    }
    throw new Error("RESOURCE_GIT_FAILED");
  }
}

function remember(directory: string, entry: CachedResourceGitInfo) {
  cache.delete(directory);
  cache.set(directory, entry);
  const oldest = cache.keys().next().value;
  if (cache.size > CACHE_LIMIT && oldest !== undefined) cache.delete(oldest);
}
