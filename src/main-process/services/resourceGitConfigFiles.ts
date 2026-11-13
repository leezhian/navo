import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function getResourceGitBaseFiles(directory: string) {
  const files = new Set<string>();
  for (let parent = directory; ; parent = path.dirname(parent)) {
    files.add(path.join(parent, ".git"));
    if (parent === path.dirname(parent)) break;
  }
  const home = process.env.HOME || os.homedir();
  files.add(process.env.GIT_CONFIG_SYSTEM || "/etc/gitconfig");
  files.add(process.env.GIT_CONFIG_GLOBAL || path.join(home, ".gitconfig"));
  files.add(path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "git", "config"));
  return [...files];
}

/** 跟踪公共 Git 目录、Worktree 配置及 include 文件，而不把配置内容存入缓存。 */
export function getResourceGitConfigFiles(directory: string, gitDirectories: string, configuration: string) {
  const files = new Set(getResourceGitBaseFiles(directory));
  for (const gitDirectory of gitDirectories.trim().split(/\r?\n/)) {
    for (const name of ["config", "config.worktree", "HEAD", "commondir"]) files.add(path.resolve(directory, gitDirectory, name));
  }
  const entries = configuration.split("\0");
  for (let index = 0; index + 1 < entries.length; index += 2) {
    const origin = entries[index];
    if (!origin.startsWith("file:")) continue;
    const configFile = path.resolve(directory, origin.slice(5));
    files.add(configFile);
    const separator = entries[index + 1].indexOf("\n");
    if (separator < 0) continue;
    const key = entries[index + 1].slice(0, separator);
    if (!/^include(?:if\..+)?\.path$/i.test(key)) continue;
    const value = entries[index + 1].slice(separator + 1);
    const includedPath = value.startsWith("~/") ? path.join(process.env.HOME || os.homedir(), value.slice(2)) : value;
    if (includedPath) files.add(path.resolve(path.dirname(configFile), includedPath));
  }
  return [...files];
}

/** 缓存命中只检查文件元信息，不执行 Git；目录只比较身份，避免对象写入导致无关失效。 */
export async function getResourceGitFingerprint(files: string[]) {
  const stamps = await Promise.all(files.map(async (file) => {
    try {
      const metadata = await stat(file);
      return [file, metadata.dev, metadata.ino, metadata.isDirectory() ? "directory" : [metadata.size, metadata.mtimeMs, metadata.ctimeMs]];
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return [file, "missing"];
      throw error;
    }
  }));
  const environment = Object.entries(process.env).filter(([key]) => key.startsWith("GIT_") || key === "HOME" || key === "XDG_CONFIG_HOME").sort();
  return createHash("sha256").update(JSON.stringify([stamps, environment])).digest("hex");
}
