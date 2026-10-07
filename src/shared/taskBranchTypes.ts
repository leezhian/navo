import type { CompareMode } from "../domain/types";

export interface TaskBranchFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  binary: boolean;
}
export interface TaskBranchCommit {
  sha: string;
  title: string;
  author: string;
  date: string;
}
export interface TaskBranchSnapshot {
  projectPath: string;
  branchName: string;
  baseBranch: string;
  /** 无有效源分支或尚无提交时，不假装存在分支对比数据。 */
  baseAvailable: boolean;
  files: Record<CompareMode, TaskBranchFile[]>;
  untrackedCount: number;
  commits: TaskBranchCommit[];
  /** 最多展示最近 100 条，数量不冒充完整提交总数。 */
  hasMoreCommits: boolean;
}
