import type { IssueItem } from "../../../domain/issues";
import { isOpenIssueStatus } from "./statusMapping";
import { normalizeRepoIdentity, parseProviderIssueUrl, sameRepository } from "./issueIdentity";

function itemRepoIdentity(item: IssueItem) {
  if (item.host && item.repository) return { host: item.host.toLowerCase(), repository: item.repository.toLowerCase() };
  const parsed = item.url ? parseProviderIssueUrl(item.url) : null;
  return parsed?.host && parsed.repository ? { host: parsed.host.toLowerCase(), repository: parsed.repository.toLowerCase() } : null;
}

export interface WorktreeIdentity {
  taskId: string;
  resourceId: string;
  name: string;
  workingPath: string;
  branch: string;
  remoteUrl?: string | null;
  archived?: boolean;
}

/** 只自动关联当前账号自己创建的、未关闭、且源分支与同仓库工作区完全一致的 PR。 */
export function matchingAutolinkPullRequests(pullRequests: IssueItem[], worktrees: WorktreeIdentity[], login: string, excluded: Set<string>) {
  const matches: { taskId: string; resourceId: string; pullRequest: IssueItem }[] = [];
  for (const worktree of worktrees) {
    if (worktree.archived || !worktree.branch) continue;
    const repo = normalizeRepoIdentity(worktree.remoteUrl ?? worktree.name);
    for (const pullRequest of pullRequests) {
      if (pullRequest.group !== "PR" || !isOpenIssueStatus(pullRequest.status)) continue;
      if (pullRequest.author?.login !== login) continue;
      if (pullRequest.headBranch !== worktree.branch) continue;
      const pullRepo = itemRepoIdentity(pullRequest);
      if (!sameRepository(repo, pullRepo)) continue;
      if (excluded.has(`${worktree.taskId}:${pullRequest.id}`)) continue;
      matches.push({ taskId: worktree.taskId, resourceId: worktree.resourceId, pullRequest });
    }
  }
  return matches;
}

export function matchingWorktreesForPullRequest(pullRequest: IssueItem, worktrees: WorktreeIdentity[]) {
  const pullRepo = itemRepoIdentity(pullRequest);
  return worktrees.filter((worktree) => {
    if (worktree.archived || !worktree.branch || worktree.branch !== pullRequest.headBranch) return false;
    return sameRepository(normalizeRepoIdentity(worktree.remoteUrl ?? worktree.name), pullRepo);
  });
}

export function matchingPullRequestForWorktree(pullRequests: IssueItem[], worktree: WorktreeIdentity) {
  const repo = normalizeRepoIdentity(worktree.remoteUrl ?? worktree.name);
  return pullRequests.find((pullRequest) => {
    if (pullRequest.group !== "PR" || pullRequest.headBranch !== worktree.branch) return false;
    const pullRepo = itemRepoIdentity(pullRequest);
    return sameRepository(repo, pullRepo);
  }) ?? null;
}
