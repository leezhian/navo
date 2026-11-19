import type { Task } from "../../domain/tasks";
import type { TaskProgressStage } from "../../shared/taskProgress";
import { TASK_PROGRESS_STAGES, taskProgress } from "../../shared/taskProgress";
import { matchingWorktreesForPullRequest } from "./integrations/autolink";
import { parseProviderIssueUrl } from "./integrations/issueIdentity";
import type { TaskProgressWorkspace } from "./taskProgressGit";

/** 与工作区当前仓库和分支相关的 PR 才推动开发进度，参考链接不影响其他分支。 */
export function inferTaskProgress(task: Task, workspaces: Array<TaskProgressWorkspace | null>) {
  const previous = taskProgress(task);
  const resources = (task.resources ?? []).filter((resource) => resource.mode !== "folder");
  const pullRequests = [...(task.links ?? []), ...(task.archivedLinks ?? [])].filter((link) => link.group === "PR");
  const units = resources.map((resource, index) => {
    const git = workspaces[index];
    const branch = git?.branch || resource.targetBranch || resource.sourceBranch.replace(/^refs\/heads\//, "");
    const identity = { taskId: task.id, resourceId: resource.resourceId, name: resource.name,
      workingPath: resource.workingPath, branch, remoteUrl: git?.remoteUrl };
    return { git, pullRequests: pullRequests.filter((pr) => matchingWorktreesForPullRequest(pr, [identity]).length > 0) };
  });
  const related = resources.length ? [...new Map(units.flatMap((unit) => unit.pullRequests).map((pr) => [pr.id, pr])).values()] : pullRequests;
  const unresolved = resources.length > 0 && pullRequests.some((pr) => !pr.headBranch
    || !(pr.host && pr.repository) && !(pr.url && parseProviderIssueUrl(pr.url)?.repository));
  const complete = workspaces.every(Boolean) && related.every((pr) => !pr.fetchError) && !unresolved;
  const open = related.some((pr) => pr.status !== "merged" && pr.status !== "closed");
  const development = units.some(({ git }) => git && (git.dirty || git.ahead > 0 || (!git.onDefaultBranch && (git.aheadOfBase ?? 0) > 0)));
  const completed = units.map(({ git, pullRequests: prs }) => prs.every((pr) => pr.status === "merged" || pr.status === "closed")
    && (prs.some((pr) => pr.status === "merged") || Boolean(git && !git.onDefaultBranch && git.landedInBase)));
  // 其他分支的目标不可比较时，也不能仅凭某一个已合并 PR 宣告整项任务完成。
  const unfinishedBranch = units.some(({ git }, index) => !completed[index] && git && !git.onDefaultBranch
    && (git.aheadOfBase === null || git.aheadOfBase > 0));
  const done = complete && !open && (resources.length
    ? completed.some(Boolean) && !unfinishedBranch
    : related.length > 0 && related.every((pr) => pr.status === "merged"));
  let stage: TaskProgressStage = done ? "done" : open ? "review" : development ? "development" : "exploration";
  // 临时读不到目录、PR 或全部证据消失时，保留最后一次可靠进度，避免闪回探索／误判完成。
  if ((!complete && stage === "done") || stage === "exploration") stage = previous.evidence;
  if (!complete && TASK_PROGRESS_STAGES.indexOf(stage) < TASK_PROGRESS_STAGES.indexOf(previous.evidence)) stage = previous.evidence;
  const localChanges = stage === "done" && workspaces.some((git) => git && (git.dirty || git.ahead > 0 && git.behind === 0));
  return { stage, complete, localChanges };
}
