import type {
  CommitChangesParams,
  GetCommitStatusParams,
  GitCommitStatus,
} from "../../shared/electronApi";
import { runGit } from "./gitCommandService";

const EMPTY_COMMIT_DIFF_STATS = {
  staged: { additions: 0, deletions: 0 },
  unstaged: { additions: 0, deletions: 0 },
};

/**
 * 读取提交按钮与弹窗所需的 Git 状态。
 * 后台监听默认只执行 porcelain 状态查询；弹窗需要展示增删数时才额外读取两个 shortstat。
 */
export async function getCommitStatus({
  projectPath,
  includeDiffStats = false,
}: GetCommitStatusParams): Promise<GitCommitStatus> {
  const [statusOutput, diffStats] = await Promise.all([
    runGit(projectPath, ["status", "--porcelain=v2", "--branch"]),
    includeDiffStats ? loadCommitDiffStats(projectPath) : Promise.resolve(EMPTY_COMMIT_DIFF_STATS),
  ]);

  const parsedStatus = parsePorcelainStatus(statusOutput.stdout);
  // 没有 upstream 时 branch.ab 不存在，用当前分支提交数作为首次推送候选数。
  const aheadCount = parsedStatus.hasUpstream
    ? parsedStatus.aheadCount
    : await getLocalCommitCount(projectPath);

  return {
    ...parsedStatus,
    aheadCount,
    stagedAdditions: diffStats.staged.additions,
    stagedDeletions: diffStats.staged.deletions,
    unstagedAdditions: diffStats.unstaged.additions,
    unstagedDeletions: diffStats.unstaged.deletions,
  };
}

export async function commitChanges({ projectPath, message, includeUnstaged }: CommitChangesParams): Promise<void> {
  if (includeUnstaged) {
    await runGit(projectPath, ["add", "-A"]);
  }

  await runGit(projectPath, ["commit", "-m", message]);
}

export async function pushCommits(projectPath: string): Promise<void> {
  const status = await getCommitStatus({ projectPath });

  if (status.hasUpstream) {
    await runGit(projectPath, ["push"]);
    return;
  }

  // 首次推送自动建立 upstream，避免用户手动处理 tracking 分支。
  await runGit(projectPath, ["push", "-u", "origin", status.branchName]);
}

interface CommitDiffStats {
  additions: number;
  deletions: number;
}

async function loadCommitDiffStats(projectPath: string) {
  const [stagedStatOutput, unstagedStatOutput] = await Promise.all([
    runGit(projectPath, ["diff", "--cached", "--shortstat"]),
    runGit(projectPath, ["diff", "--shortstat"]),
  ]);

  return {
    staged: parseShortstat(stagedStatOutput.stdout),
    unstaged: parseShortstat(unstagedStatOutput.stdout),
  };
}

async function getLocalCommitCount(projectPath: string): Promise<number> {
  try {
    const output = await runGit(projectPath, ["rev-list", "--count", "HEAD"]);
    return Number(output.stdout.trim()) || 0;
  } catch {
    // 空仓库没有 HEAD，不能视为存在可推送提交。
    return 0;
  }
}

function parsePorcelainStatus(stdout: string) {
  let branchName = "";
  let isDetached = false;
  let hasUpstream = false;
  let aheadCount = 0;
  let stagedFileCount = 0;
  let unstagedFileCount = 0;

  for (const line of stdout.split("\n")) {
    if (line.startsWith("# branch.head ")) {
      branchName = line.slice("# branch.head ".length).trim();
      isDetached = branchName === "(detached)";
      continue;
    }
    if (line.startsWith("# branch.upstream ")) {
      hasUpstream = true;
      continue;
    }
    if (line.startsWith("# branch.ab ")) {
      aheadCount = Number(/\+(\d+)/.exec(line)?.[1] ?? 0);
      continue;
    }
    // 1/2 开头为普通/重命名条目，XY 两位分别表示暂存区与工作区状态。
    if (line.startsWith("1 ") || line.startsWith("2 ")) {
      if (line[2] !== ".") {
        stagedFileCount += 1;
      }
      if (line[3] !== ".") {
        unstagedFileCount += 1;
      }
      continue;
    }
    // 冲突（u）与未跟踪（?）文件都按未暂存改动计入。
    if (line.startsWith("u ") || line.startsWith("? ")) {
      unstagedFileCount += 1;
    }
  }

  return { branchName, isDetached, hasUpstream, aheadCount, stagedFileCount, unstagedFileCount };
}

function parseShortstat(stdout: string): CommitDiffStats {
  return {
    additions: Number(/(\d+) insertion/.exec(stdout)?.[1] ?? 0),
    deletions: Number(/(\d+) deletion/.exec(stdout)?.[1] ?? 0),
  };
}
