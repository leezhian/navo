import type { GitCommitStatus } from "@/shared/electronApi";

/** 比较提交按钮与弹窗真正使用的全部状态字段，避免无变化时触发 React 重渲染。 */
export function areCommitStatusesEqual(left: GitCommitStatus | null, right: GitCommitStatus) {
  if (left === null) {
    return false;
  }

  return (
    left.branchName === right.branchName &&
    left.isDetached === right.isDetached &&
    left.hasUpstream === right.hasUpstream &&
    left.aheadCount === right.aheadCount &&
    left.stagedFileCount === right.stagedFileCount &&
    left.unstagedFileCount === right.unstagedFileCount &&
    left.stagedAdditions === right.stagedAdditions &&
    left.stagedDeletions === right.stagedDeletions &&
    left.unstagedAdditions === right.unstagedAdditions &&
    left.unstagedDeletions === right.unstagedDeletions
  );
}

/** 基础状态请求不包含 shortstat；保留最近统计直到弹窗发起下一次完整刷新。 */
export function preserveCommitDiffStats(
  status: GitCommitStatus,
  previousStatus: GitCommitStatus | null,
): GitCommitStatus {
  if (previousStatus === null) {
    return status;
  }

  return {
    ...status,
    stagedAdditions: previousStatus.stagedAdditions,
    stagedDeletions: previousStatus.stagedDeletions,
    unstagedAdditions: previousStatus.unstagedAdditions,
    unstagedDeletions: previousStatus.unstagedDeletions,
  };
}
