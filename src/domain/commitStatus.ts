import type { GitCommitStatus } from "@/shared/electronApi";

export interface CommitStatusCapabilities {
  /** 是否存在已暂存文件。 */
  hasStagedChanges: boolean;
  /** 是否存在未暂存、未跟踪或冲突文件。 */
  hasUnstagedChanges: boolean;
  /** 是否存在任意本地文件改动。 */
  hasLocalChanges: boolean;
  /** 当前分支是否存在可推送的本地提交。 */
  canPush: boolean;
  /** 顶栏是否至少存在一种可进入的提交或推送操作。 */
  hasAvailableAction: boolean;
}

/**
 * 将 Git 状态转换为按钮组和提交弹窗共用的基础能力。
 * 具体提交信息和复选框状态由弹窗继续在本地计算。
 */
export function getCommitStatusCapabilities(status: GitCommitStatus | null): CommitStatusCapabilities {
  if (status === null) {
    return {
      hasStagedChanges: false,
      hasUnstagedChanges: false,
      hasLocalChanges: false,
      canPush: false,
      hasAvailableAction: false,
    };
  }

  const hasStagedChanges = status.stagedFileCount > 0;
  const hasUnstagedChanges = status.unstagedFileCount > 0;
  const hasLocalChanges = hasStagedChanges || hasUnstagedChanges;
  const canPush = status.aheadCount > 0 && !status.isDetached;

  return {
    hasStagedChanges,
    hasUnstagedChanges,
    hasLocalChanges,
    canPush,
    hasAvailableAction: hasLocalChanges || canPush,
  };
}
