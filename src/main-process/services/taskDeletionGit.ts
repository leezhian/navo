import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** 不 trim porcelain/NUL 输出，不运行 diff 外部命令，也不联网。 */
export async function deletionGit(directory: string, args: string[]) {
  return (await execute("git", args, {
    cwd: directory, encoding: "utf8", timeout: 30000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
  })).stdout;
}

export function deletionFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function directoryIdentity(directory: string) {
  const info = await lstat(directory, { bigint: true });
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("TASK_DELETE_CHANGED");
  return { path: await realpath(directory), id: info.dev + ":" + info.ino };
}

export async function pathExists(filePath: string) {
  try { await lstat(filePath); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

export async function branchOid(repository: string, branch: string) {
  const result = await deletionGit(repository, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads/" + branch]);
  return result.split("\n").find((line) => line.startsWith("refs/heads/" + branch + " "))?.split(" ")[1] ?? "";
}

export async function worktreeList(repository: string) {
  const output = await deletionGit(repository, ["worktree", "list", "--porcelain", "-z"]);
  return output.split("\0\0").filter(Boolean).map((block) => {
    const fields = block.split("\0");
    return {
      path: fields.find((field) => field.startsWith("worktree "))?.slice(9) ?? "",
      branch: fields.find((field) => field.startsWith("branch "))?.slice(7) ?? "",
      locked: fields.some((field) => field === "locked" || field.startsWith("locked ")),
    };
  });
}

/** 文件列表和内容变更均参与确认签名，不能只比较修改数量。 */
export async function workingCopyRisk(directory: string) {
  const tracked = await deletionGit(directory, ["ls-files", "--stage", "-z"]);
  if (tracked.split("\0").some((file) => file.startsWith("160000 "))) throw new Error("TASK_DELETE_INSPECTION");
  const [status, staged, unstaged, changed, untracked, ignored, head] = await Promise.all([
    deletionGit(directory, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    deletionGit(directory, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv"]),
    deletionGit(directory, ["diff", "--binary", "--no-ext-diff", "--no-textconv"]),
    deletionGit(directory, ["diff", "HEAD", "--name-only", "-z", "--no-ext-diff", "--no-textconv"]),
    deletionGit(directory, ["ls-files", "--others", "--exclude-standard", "-z"]),
    deletionGit(directory, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"]),
    deletionGit(directory, ["rev-parse", "HEAD"]),
  ]);
  const list = (value: string) => value.split("\0").filter(Boolean);
  const files = [...new Set([...list(changed), ...list(untracked), ...list(ignored)])].sort();
  const identities = [];
  for (const file of files) {
    const filename = path.resolve(directory, file);
    if (!filename.startsWith(path.resolve(directory) + path.sep)) throw new Error("TASK_DELETE_INSPECTION");
    try {
      const info = await lstat(filename, { bigint: true });
      // Git 将嵌套仓库作为目录返回；不递归强删无法审计的内容。
      if (info.isDirectory()) throw new Error("TASK_DELETE_INSPECTION");
      identities.push([file, String(info.dev), String(info.ino), String(info.size), String(info.mtimeNs), String(info.ctimeNs)]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      identities.push([file, "missing"]);
    }
  }
  // porcelain 重命名有第二个路径字段，不重复计入文件数。
  let uncommittedFiles = 0;
  const entries = list(status);
  for (let index = 0; index < entries.length; index += 1) {
    uncommittedFiles += 1;
    if (/[RC]/.test(entries[index].slice(0, 2))) index += 1;
  }
  return { uncommittedFiles, ignoredFiles: list(ignored).length, fingerprint: deletionFingerprint({ status, staged, unstaged, tracked, head, identities }) };
}
