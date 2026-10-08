import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import type { TaskResourceInfo } from "../../shared/taskTypes";
import type { ResourceRecord } from "../../shared/settingsTypes";

const execute = promisify(execFile);

export async function taskGit(directory: string, args: string[]) {
  const { stdout } = await execute("git", args, {
    cwd: directory, encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
}

export async function gitValue(directory: string, args: string[]): Promise<string | null> {
  try { return await taskGit(directory, args); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("GIT_UNAVAILABLE");
    return null;
  }
}

export async function inspectTaskResource(resource: ResourceRecord): Promise<TaskResourceInfo> {
  const directory = await realpath(resource.localPath);
  if (!(await stat(directory)).isDirectory()) throw new Error("INVALID_DIRECTORY");
  const root = await gitValue(directory, ["rev-parse", "--show-toplevel"]);
  const info: TaskResourceInfo = { resourceId: resource.id, name: resource.name, path: directory, git: null };
  if (!root) return info;
  const currentRef = await gitValue(root, ["symbolic-ref", "--quiet", "HEAD"]);
  const currentBranch = currentRef?.replace(/^refs\/heads\//, "") ?? "";
  const output = await taskGit(root, ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"]);
  const branches = output.split("\n").filter((ref) => ref && !ref.endsWith("/HEAD")).map((ref) => ({
    ref,
    name: ref.replace(/^refs\/(heads|remotes)\//, ""),
    kind: ref.startsWith("refs/heads/") ? "local" as const : "remote" as const,
  }));
  const remoteHead = await gitValue(root, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
  const candidates = [remoteHead, "refs/remotes/origin/main", "refs/remotes/origin/master", "refs/heads/main", "refs/heads/master", currentRef];
  const defaultSource = candidates.find((candidate) => candidate && branches.some((branch) => branch.ref === candidate)) ?? branches[0]?.ref ?? "";
  const worktrees = await listTaskWorktrees(root);
  info.git = { root: await realpath(root), currentBranch, defaultSource, branches, worktrees };
  return info;
}

export async function listTaskWorktrees(directory: string) {
  const output = await taskGit(directory, ["worktree", "list", "--porcelain", "-z"]);
  return output.split("\0\0").filter(Boolean).map((block, index) => {
    const fields = block.split("\0");
    return { path: fields.find((field) => field.startsWith("worktree "))?.slice(9) ?? "",
      branch: fields.find((field) => field.startsWith("branch "))?.slice(7).replace(/^refs\/heads\//, "") ?? "", isMain: index === 0 };
  });
}

export async function validateNewBranch(directory: string, name: string) {
  if (!name || name !== name.trim() || name.length > 240 || name === "HEAD" || name.startsWith("-")) throw new Error("TASK_INVALID_BRANCH");
  if (await gitValue(directory, ["check-ref-format", "--branch", name]) === null) throw new Error("TASK_INVALID_BRANCH");
  if (await gitValue(directory, ["show-ref", "--verify", "--quiet", "refs/heads/" + name]) !== null) throw new Error("TASK_BRANCH_EXISTS");
}

export async function generateTaskBranch(directory: string, prefix: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const name = prefix + randomBytes(4).toString("hex");
    try { await validateNewBranch(directory, name); return name; }
    catch (error) { if (!(error instanceof Error) || error.message !== "TASK_BRANCH_EXISTS") throw error; }
  }
  throw new Error("TASK_BRANCH_EXISTS");
}
