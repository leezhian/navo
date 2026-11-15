import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath, stat } from "node:fs/promises";
import type { Task } from "../../domain/tasks";
import type { TaskResource } from "../../shared/taskTypes";
import {
  CHANGE_GIT_FILE_CAP,
  CHANGE_GIT_TIMEOUT_MS,
  headerPathAfter,
  isSameTrackingRef,
  parseShortstat,
  type ChangeGitOperation,
  type ChangeGitOperationKind,
  type ChangeGitSourceBehind,
  type ChangeGitStatus,
  type ChangeGitUncommitted,
  type ChangeGitUpstream,
} from "../../shared/changeGitStatus";

const execute = promisify(execFile);

function emptyStatus(resource: TaskResource, patch: Partial<ChangeGitStatus> = {}): ChangeGitStatus {
  return {
    branchName: resource.targetBranch || resource.sourceBranch,
    repoName: resource.name,
    workingPath: resource.workingPath,
    isDetached: false,
    missingDirectory: false,
    failed: false,
    operation: null,
    sinceSource: null,
    uncommitted: { files: 0, additions: 0, deletions: 0 },
    untrackedCount: 0,
    upstream: null,
    sourceBehind: null,
    isMainWorktree: false,
    ...patch,
  };
}

async function readGit(directory: string, args: string[]) {
  const { stdout } = await execute("git", args, {
    cwd: directory,
    encoding: "utf8",
    timeout: CHANGE_GIT_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
  });
  return stdout;
}

async function tryGit(directory: string, args: string[]) {
  try { return await readGit(directory, args); }
  catch { return null; }
}

function bufferExceeded(error: unknown) {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
}

/** 只读查询已关联工作区的 Git 状态，不接收渲染进程提供的路径，也不执行 fetch。 */
export class ChangeGitStatusService {
  constructor(private readonly loadTasks: () => Promise<Task[] | null>) {}

  async inspect(taskId: string, resourceId: string): Promise<ChangeGitStatus> {
    if (typeof taskId !== "string" || typeof resourceId !== "string" || !taskId || !resourceId) throw new Error("TASK_INVALID");
    const task = (await this.loadTasks())?.find((item) => item.id === taskId);
    const resource = task?.resources?.find((item) => item.resourceId === resourceId && item.mode !== "folder");
    if (!resource) throw new Error("RESOURCE_NOT_FOUND");
    try {
      const directoryStat = await stat(resource.workingPath);
      if (!directoryStat.isDirectory()) return emptyStatus(resource, { missingDirectory: true });
    } catch {
      return emptyStatus(resource, { missingDirectory: true });
    }
    try {
      const directory = await realpath(resource.workingPath);
      return await this.readStatus(resource, directory);
    } catch {
      return emptyStatus(resource, { failed: true });
    }
  }

  private async readStatus(resource: TaskResource, directory: string): Promise<ChangeGitStatus> {
    let statusOutput: string;
    let uncommittedOverflow = false;
    try {
      statusOutput = await readGit(directory, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"]);
    } catch (error) {
      if (!bufferExceeded(error)) throw error;
      statusOutput = await readGit(directory, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=no"]);
      uncommittedOverflow = true;
    }
    const parsed = parsePorcelainStatus(statusOutput);
    if (parsed.uniqueDirty >= CHANGE_GIT_FILE_CAP) uncommittedOverflow = true;
    const [shortHead, gitDir, commonDir, operation] = await Promise.all([
      tryGit(directory, ["rev-parse", "--short", "HEAD"]),
      tryGit(directory, ["rev-parse", "--path-format=absolute", "--git-dir"]),
      tryGit(directory, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
      detectOperation(directory, parsed.conflicts),
    ]);
    const isDetached = parsed.isDetached;
    const branchName = isDetached ? (shortHead?.trim() || parsed.branchName) : (parsed.branchName || resource.targetBranch || resource.sourceBranch);
    const isMainWorktree = await sameDirectory(gitDir?.trim(), commonDir?.trim());
    const uncommitted = uncommittedOverflow ? "uncounted" as const : await readUncommittedStats(directory, parsed);
    const comparison = await readSourceComparison(directory, resource.sourceBranch, parsed.upstream);
    return {
      branchName,
      repoName: resource.name,
      workingPath: resource.workingPath,
      isDetached,
      missingDirectory: false,
      failed: false,
      operation,
      sinceSource: comparison.sinceSource,
      uncommitted,
      untrackedCount: uncommittedOverflow ? 0 : parsed.untracked,
      upstream: parsed.upstream,
      sourceBehind: comparison.sourceBehind,
      isMainWorktree,
    };
  }
}

interface ParsedPorcelain {
  branchName: string;
  isDetached: boolean;
  upstream: ChangeGitUpstream | null;
  tracked: number;
  untracked: number;
  uniqueDirty: number;
  conflicts: number;
}

export function parsePorcelainStatus(stdout: string): ParsedPorcelain {
  let branchName = "";
  let isDetached = false;
  let hasUpstream = false;
  let upstreamName = "";
  let ahead = 0;
  let behind = 0;
  const tracked = new Set<string>();
  const untracked = new Set<string>();
  const conflicts = new Set<string>();
  for (const chunk of stdout.split("\0")) {
    for (const line of chunk.split("\n")) {
      if (!line) continue;
      if (line.startsWith("# branch.head ")) {
        branchName = line.slice("# branch.head ".length).trim();
        isDetached = branchName === "(detached)";
        if (isDetached) branchName = "";
        continue;
      }
      if (line.startsWith("# branch.upstream ")) {
        hasUpstream = true;
        upstreamName = line.slice("# branch.upstream ".length).trim();
        continue;
      }
      if (line.startsWith("# branch.ab ")) {
        ahead = Number(/\+(\d+)/.exec(line)?.[1] ?? 0);
        behind = Number(/-(\d+)/.exec(line)?.[1] ?? 0);
        continue;
      }
      if (line.startsWith("1 ")) {
        const path = headerPathAfter(line, 8);
        if (path) tracked.add(path);
        continue;
      }
      if (line.startsWith("2 ")) {
        const path = headerPathAfter(line, 9);
        if (path) tracked.add(path);
        continue;
      }
      if (line.startsWith("u ")) {
        const path = headerPathAfter(line, 10);
        if (path) { tracked.add(path); conflicts.add(path); }
        continue;
      }
      if (line.startsWith("? ")) {
        const path = line.slice(2);
        if (path) untracked.add(path);
      }
    }
  }
  const uniqueDirty = new Set([...tracked, ...untracked]).size;
  return {
    branchName,
    isDetached,
    upstream: hasUpstream ? { name: upstreamName, ahead, behind } : null,
    tracked: tracked.size,
    untracked: untracked.size,
    uniqueDirty,
    conflicts: conflicts.size,
  };
}

async function readUncommittedStats(directory: string, parsed: ParsedPorcelain): Promise<ChangeGitUncommitted> {
  if (parsed.tracked === 0) return { files: 0, additions: 0, deletions: 0 };
  const output = await tryGit(directory, ["diff", "HEAD", "--shortstat"]);
  const stats = parseShortstat(output ?? "");
  return { files: parsed.tracked, additions: stats.additions, deletions: stats.deletions };
}

async function readSourceComparison(directory: string, sourceBranch: string, upstream: ChangeGitUpstream | null) {
  const branch = sourceBranch.trim();
  if (!branch) return { sinceSource: null, sourceBehind: null };
  const omitBehind = upstream ? isSameTrackingRef(branch, upstream.name) : false;
  const sourceOid = await tryGit(directory, ["rev-parse", "--verify", "--end-of-options", `${branch}^{commit}`]);
  if (!sourceOid?.trim()) {
    return { sinceSource: null, sourceBehind: omitBehind ? { kind: "omitted" } as const : { kind: "unavailable", branch } as ChangeGitSourceBehind };
  }
  const head = await tryGit(directory, ["rev-parse", "--verify", "HEAD"]);
  const mergeBase = head?.trim() ? await tryGit(directory, ["merge-base", sourceOid.trim(), head.trim()]) : null;
  if (!head?.trim() || !mergeBase?.trim()) {
    return { sinceSource: null, sourceBehind: omitBehind ? { kind: "omitted" } as const : { kind: "unavailable", branch } as ChangeGitSourceBehind };
  }
  const commitOutput = await tryGit(directory, ["rev-list", "--count", `${mergeBase.trim()}..${head.trim()}`]);
  const behindOutput = await tryGit(directory, ["rev-list", "--count", `${head.trim()}..${sourceOid.trim()}`]);
  const statOutput = await tryGit(directory, ["diff", "--shortstat", mergeBase.trim(), head.trim()]);
  const stats = parseShortstat(statOutput ?? "");
  const commits = Number(commitOutput?.trim() ?? 0) || 0;
  const behind = Number(behindOutput?.trim() ?? 0) || 0;
  const sourceBehind: ChangeGitSourceBehind = omitBehind ? { kind: "omitted" } : behind > 0 ? { kind: "behind", branch, count: behind } : { kind: "even", branch };
  return {
    sinceSource: { branch, commits, files: stats.files, additions: stats.additions, deletions: stats.deletions },
    sourceBehind,
  };
}

async function detectOperation(directory: string, conflicts: number): Promise<ChangeGitOperation | null> {
  const checks: Array<{ kind: ChangeGitOperationKind; args: string[]; directory?: boolean }> = [
    { kind: "rebase", args: ["rev-parse", "--path-format=absolute", "--git-path", "rebase-merge"], directory: true },
    { kind: "rebase", args: ["rev-parse", "--path-format=absolute", "--git-path", "rebase-apply"], directory: true },
    { kind: "rebase", args: ["rev-parse", "--verify", "--quiet", "--end-of-options", "REBASE_HEAD"] },
    { kind: "merge", args: ["rev-parse", "--verify", "--quiet", "--end-of-options", "MERGE_HEAD"] },
    { kind: "cherryPick", args: ["rev-parse", "--verify", "--quiet", "--end-of-options", "CHERRY_PICK_HEAD"] },
    { kind: "revert", args: ["rev-parse", "--verify", "--quiet", "--end-of-options", "REVERT_HEAD"] },
  ];
  for (const check of checks) {
    const output = await tryGit(directory, check.args);
    if (check.directory) {
      const location = output?.trim();
      if (!location || location === check.args[check.args.length - 1]) continue;
      try {
        if ((await stat(location)).isDirectory()) return { kind: check.kind, conflicts };
      } catch { /* 目录不存在表示没有进行中的操作 */ }
      continue;
    }
    if (output !== null) return { kind: check.kind, conflicts };
  }
  return null;
}

async function sameDirectory(left?: string, right?: string) {
  if (!left || !right) return false;
  try { return await realpath(left) === await realpath(right); }
  catch { return left.replace(/\/+$/, "") === right.replace(/\/+$/, ""); }
}
