export interface TaskDeletionOptions {
  deleteWorktrees: boolean;
  /** 仅在同时删除 Worktree 时生效，只涉及本地分支。 */
  deleteBranches: boolean;
}

export type TaskDeletionReason = "existing" | "unowned" | "shared" | "changed" | "main" | "locked" | "missing" | "protected" | "inUse" | "inspectionFailed";
export type TaskDeletionAction = "keep" | "delete" | "removed";

export interface TaskDeletionItem {
  resourceId: string;
  name: string;
  path: string;
  branch: string;
  worktreeAction: TaskDeletionAction;
  branchAction: TaskDeletionAction;
  worktreeReason?: TaskDeletionReason;
  branchReason?: TaskDeletionReason;
  sharedTasks: string[];
  uncommittedFiles: number;
  ignoredFiles: number;
  detached: boolean;
  /** 仅依据本地远端引用；null 表示无法确认，绝不当作零风险。 */
  unpushedCommits: number | null;
}

export interface TaskDeletionPreview {
  /** 主进程签发、绑定任务/窗口/选项的短期一次性确认凭据。 */
  token: string;
  canDeleteWorktrees: boolean;
  blocked: boolean;
  items: TaskDeletionItem[];
}

export interface TaskDeletionConfirmation {
  token: string;
}

/** 删除操作独立于创建回滚日志；重启后只展示进度，不自动继续破坏性操作。 */
export interface TaskDeletionProgress {
  /** 单独清理工作区的恢复记录；省略表示删除整个任务。 */
  scope?: "workspace";
  resourceId: string;
  worktree: "pending" | "removed";
  branch?: "pending" | "removed";
  branchOid: string;
}

export interface TaskWorktreeDeletionPreview {
  /** 绑定窗口、任务和指定工作区的一次性凭据。 */
  token: string;
  blocked: boolean;
  item: TaskDeletionItem;
}
