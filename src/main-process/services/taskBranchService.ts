import { realpath, stat } from "node:fs/promises";
import type { Task } from "../../domain/tasks";
import type { TaskBranchFile, TaskBranchSnapshot } from "../../shared/taskBranchTypes";
import { runGit } from "./gitCommandService";

const COMMIT_LIMIT = 100;

async function readFiles(directory: string, revisionArgs: string[]): Promise<TaskBranchFile[]> {
  const common = ["diff", "--no-ext-diff", "--no-textconv", "--no-renames", ...revisionArgs];
  const [stats, statuses] = await Promise.all([
    runGit(directory, [...common, "--numstat", "-z", "--"]),
    runGit(directory, [...common, "--name-status", "-z", "--"]),
  ]);
  const statusFields = statuses.stdout.split("\0");
  const byPath = new Map<string, string>();
  for (let index = 0; index + 1 < statusFields.length; index += 2) byPath.set(statusFields[index + 1], statusFields[index]);
  return stats.stdout.split("\0").filter(Boolean).map((entry) => {
    const firstTab = entry.indexOf("\t");
    const secondTab = entry.indexOf("\t", firstTab + 1);
    const added = entry.slice(0, firstTab), removed = entry.slice(firstTab + 1, secondTab), filename = entry.slice(secondTab + 1);
    return { path: filename, status: byPath.get(filename) ?? "M", additions: Number(added) || 0, deletions: Number(removed) || 0, binary: added === "-" || removed === "-" };
  });
}

/** 分支栏只读查询已关联目录，不接收渲染进程提供的任意路径或 Git 参数。 */
export class TaskBranchService {
  constructor(private readonly loadTasks: () => Promise<Task[] | null>) {}

  async load(taskId: string, resourceId: string): Promise<TaskBranchSnapshot> {
    if (typeof taskId !== "string" || typeof resourceId !== "string") throw new Error("TASK_INVALID");
    const task = (await this.loadTasks())?.find((item) => item.id === taskId);
    const resource = task?.resources?.find((item) => item.resourceId === resourceId && item.mode !== "folder");
    if (!resource) throw new Error("RESOURCE_NOT_FOUND");
    const directory = await realpath(resource.workingPath);
    if (!(await stat(directory)).isDirectory()) throw new Error("INVALID_DIRECTORY");
    await runGit(directory, ["rev-parse", "--show-toplevel"]);
    const head = await runGit(directory, ["rev-parse", "--verify", "HEAD"]).then((result) => result.stdout.trim()).catch(() => "");
    const branchName = await runGit(directory, ["symbolic-ref", "--quiet", "--short", "HEAD"]).then((result) => result.stdout.trim()).catch(() => head.slice(0, 8));
    const baseBranch = resource.sourceBranch || "";
    const base = baseBranch ? await runGit(directory, ["rev-parse", "--verify", "--end-of-options", `${baseBranch}^{commit}`]).then((result) => result.stdout.trim()).catch(() => "") : "";
    const mergeBase = head && base ? await runGit(directory, ["merge-base", base, head]).then((result) => result.stdout.trim()).catch(() => "") : "";
    const [unstaged, staged, branch, untracked, history] = await Promise.all([
      readFiles(directory, []), readFiles(directory, ["--cached"]),
      mergeBase ? readFiles(directory, [mergeBase, head]) : Promise.resolve([]),
      runGit(directory, ["ls-files", "--others", "--exclude-standard", "-z"]),
      mergeBase ? runGit(directory, ["log", "-z", `--max-count=${COMMIT_LIMIT + 1}`, "--format=%H%x00%s%x00%aI%x00%an", `${base}..${head}`, "--"]) : Promise.resolve({ stdout: "" }),
    ]);
    const fields = history.stdout.split("\0");
    const commits = [];
    for (let index = 0; index + 3 < fields.length; index += 4) commits.push({ sha: fields[index], title: fields[index + 1], date: fields[index + 2], author: fields[index + 3] });
    return { projectPath: directory, branchName, baseBranch, baseAvailable: Boolean(mergeBase), files: { unstaged, staged, branch },
      untrackedCount: untracked.stdout.split("\0").filter(Boolean).length, commits: commits.slice(0, COMMIT_LIMIT), hasMoreCommits: commits.length > COMMIT_LIMIT };
  }
}
