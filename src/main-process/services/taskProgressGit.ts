import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TaskResource } from "../../shared/taskTypes";
import { parsePorcelainStatus } from "./changeGitStatusService";

const execute = promisify(execFile);

export interface TaskProgressWorkspace {
  resourceId: string;
  branch: string;
  head: string;
  remoteUrl: string | null;
  dirty: boolean;
  ahead: number;
  behind: number;
  aheadOfBase: number | null;
  landedInBase: boolean;
  onDefaultBranch: boolean;
}

/** 仅查询本地引用；不 fetch、不修改工作区，不把失败当成干净或已合入。 */
export async function inspectTaskProgressGit(resource: TaskResource): Promise<TaskProgressWorkspace | null> {
  const read = async (args: string[]) => {
    const { stdout } = await execute("git", args, { cwd: resource.workingPath, encoding: "utf8", timeout: 5000,
      maxBuffer: 4 * 1024 * 1024, env: { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" } });
    return stdout.trim();
  };
  const optional = (args: string[]) => read(args).catch(() => null);
  try {
    const [raw, head, remoteUrl, remoteHead, directories] = await Promise.all([
      read(["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=normal"]),
      optional(["rev-parse", "--verify", "HEAD"]), optional(["remote", "get-url", "origin"]),
      optional(["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]),
      read(["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"]),
    ]);
    const status = parsePorcelainStatus(raw);
    const branch = status.branchName;
    const normalizeBranch = (ref: string) => ref.replace(/^refs\/(heads|remotes\/origin)\//, "").replace(/^origin\//, "");
    let defaultBranch = remoteHead ? normalizeBranch(remoteHead) : "";
    if (!defaultBranch) {
      for (const candidate of ["main", "master"]) {
        if (await optional(["show-ref", "--verify", "refs/heads/" + candidate])) { defaultBranch = candidate; break; }
      }
    }
    const [gitDir, commonDir] = directories.split("\n");
    const onDefaultBranch = gitDir === commonDir && branch === defaultBranch;
    const source = resource.sourceBranch.trim();
    const base = source ? await optional(["rev-parse", "--verify", "--end-of-options", `${source}^{commit}`]) : null;
    const comparison = base && head ? await optional(["rev-list", "--left-right", "--count", `${base}...${head}`]) : null;
    const counts = comparison?.split(/\s+/).map(Number);
    const aheadOfBase = counts?.length === 2 && counts.every(Number.isSafeInteger) ? counts[1] : null;
    let landedInBase = false;
    if (base && branch && !onDefaultBranch && branch !== normalizeBranch(source) && aheadOfBase === 0) {
      const reflog = await optional(["reflog", "show", "--format=%H%x00%gs", "-100", `refs/heads/${branch}`, "--"]);
      // 与 Kepler 一样检查分支自己的提交记录：只有 branch created 的空分支不能算已合入。
      const commitAction = /^(?:commit(?: \((?:initial|amend|merge|cherry-pick)\))?|cherry-pick|revert|am): /;
      const candidates = [...new Set((reflog ?? "").split("\n").filter((line) => commitAction.test(line.split("\0")[1] ?? ""))
        .map((line) => line.split("\0")[0]))].slice(0, 25);
      for (const commit of candidates) {
        if (await optional(["merge-base", "--is-ancestor", commit, base]) !== null) { landedInBase = true; break; }
      }
    }
    return { resourceId: resource.resourceId, branch, head: head ?? "", remoteUrl,
      dirty: status.uniqueDirty > 0, ahead: status.upstream?.ahead ?? 0, behind: status.upstream?.behind ?? 0,
      aheadOfBase, landedInBase, onDefaultBranch };
  } catch { return null; }
}
