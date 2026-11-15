/** CHANGES 条目 Git 状态卡的只读结果；不包含操作按钮或关联 PR。 */
export const CHANGE_GIT_FILE_CAP = 2000;
export const CHANGE_GIT_CACHE_MS = 30_000;
export const CHANGE_GIT_TIMEOUT_MS = 5000;

export type ChangeGitOperationKind = "rebase" | "merge" | "cherryPick" | "revert";

export interface ChangeGitLineStats {
  additions: number;
  deletions: number;
}

export interface ChangeGitOperation {
  kind: ChangeGitOperationKind;
  /** 冲突路径数；为 0 时界面只显示操作已暂停。 */
  conflicts: number;
}

export interface ChangeGitSinceSource extends ChangeGitLineStats {
  branch: string;
  commits: number;
  files: number;
}

export interface ChangeGitUncommitted extends ChangeGitLineStats {
  files: number;
}

export interface ChangeGitUpstream {
  name: string;
  ahead: number;
  behind: number;
}

export type ChangeGitSourceBehind =
  | { kind: "behind"; branch: string; count: number }
  | { kind: "even"; branch: string }
  | { kind: "unavailable"; branch: string }
  | { kind: "omitted" };

export interface ChangeGitStatus {
  /** 当前分支名；分离 HEAD 时为短 SHA。 */
  branchName: string;
  repoName: string;
  workingPath: string;
  isDetached: boolean;
  missingDirectory: boolean;
  failed: boolean;
  operation: ChangeGitOperation | null;
  /** 没有有效源分支或无法比较相对提交时为 null。 */
  sinceSource: ChangeGitSinceSource | null;
  /** 达到计数上限时为 uncounted，不写成 0。 */
  uncommitted: ChangeGitUncommitted | "uncounted";
  untrackedCount: number;
  /** 没有上游时为 null，界面显示尚未发布。 */
  upstream: ChangeGitUpstream | null;
  /** 与上游是同一条跟踪关系时为 omitted。 */
  sourceBehind: ChangeGitSourceBehind | null;
  isMainWorktree: boolean;
}

/** 去掉 refs 前缀后，比较源分支与上游是否为同一条跟踪关系（main 与 origin/main）。 */
export function isSameTrackingRef(sourceBranch: string, upstream: string) {
  const source = stripRefPrefix(sourceBranch);
  const remote = stripRefPrefix(upstream);
  if (!source || !remote) return false;
  if (source === remote) return true;
  const remoteSlash = remote.indexOf("/");
  if (remoteSlash > 0 && remote.slice(remoteSlash + 1) === source) return true;
  const sourceSlash = source.indexOf("/");
  if (sourceSlash > 0 && source.slice(sourceSlash + 1) === remote) return true;
  return false;
}

function stripRefPrefix(value: string) {
  return value.trim().replace(/^refs\/heads\//, "").replace(/^refs\/remotes\//, "");
}

export function parseShortstat(stdout: string): ChangeGitLineStats & { files: number } {
  return {
    files: Number(/(\d+) file/.exec(stdout)?.[1] ?? 0),
    additions: Number(/(\d+) insertion/.exec(stdout)?.[1] ?? 0),
    deletions: Number(/(\d+) deletion/.exec(stdout)?.[1] ?? 0),
  };
}

export function headerPathAfter(line: string, tokens: number) {
  let index = 0;
  for (let count = 0; count < tokens; count += 1) {
    const space = line.indexOf(" ", index);
    if (space < 0) return "";
    index = space + 1;
  }
  return line.slice(index);
}
