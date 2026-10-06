import { execFile } from "node:child_process";
import { access, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";

export function runAgentProbe(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<{ stdout: string; stderr: string; code: number | string | null }>((resolve) => {
    execFile(command, args, { env, cwd: os.homedir(), timeout: 5000, maxBuffer: 256 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ stdout, stderr, code: error ? error.code ?? null : 0 });
    });
  });
}

export async function agentShellEnvironment(): Promise<NodeJS.ProcessEnv> {
  if (process.platform === "win32") return { ...process.env };
  const shell = process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/sh");
  const result = await runAgentProbe(shell, ["-lic", "printf '\\0NAVO_ENV\\0'; /usr/bin/env -0"], process.env);
  const marker = result.stdout.indexOf("\0NAVO_ENV\0");
  if (result.code !== 0 || marker < 0) return { ...process.env };
  const entries = result.stdout.slice(marker + 10).split("\0").filter((entry) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(entry));
  return { ...process.env, ...Object.fromEntries(entries.map((entry) => { const split = entry.indexOf("="); return [entry.slice(0, split), entry.slice(split + 1)]; })) };
}

export async function isAgentExecutable(filename: string) {
  if (!path.isAbsolute(filename) || filename.includes("\0")) return false;
  try { await access(filename, process.platform === "win32" ? constants.R_OK : constants.X_OK); return (await stat(filename)).isFile(); }
  catch { return false; }
}

export async function commonAgentDirectories() {
  const home = os.homedir();
  const directories = [path.join(home, ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", path.join(home, ".npm-global/bin"), path.join(home, ".bun/bin")];
  const versions = path.join(home, ".nvm/versions/node");
  try { for (const name of (await readdir(versions)).sort().reverse()) directories.push(path.join(versions, name, "bin")); } catch { /* nvm 为可选安装来源。 */ }
  if (process.platform === "win32" && process.env.APPDATA) directories.push(path.join(process.env.APPDATA, "npm"));
  return directories;
}

export async function findAgentBinary(binary: string, env: NodeJS.ProcessEnv) {
  const paths = (env.PATH ?? env.Path ?? "").split(path.delimiter).filter((directory) => path.isAbsolute(directory));
  const common = await commonAgentDirectories();
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const source of ["path", "common"] as const) for (const directory of source === "path" ? paths : common) for (const extension of extensions) {
    const filename = path.join(directory, binary + extension);
    if (await isAgentExecutable(filename)) return { filename, source };
  }
  return null;
}
