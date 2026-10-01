import { parseGitDiff } from "../domain/diffParser";
import type { CleanReviewStorageResult, GitCommitStatus } from "../shared/electronApi";
import type {
  CompareMode,
  ReviewBatchFileAction,
  ReviewFileAction,
  ReviewSession,
  ReviewSummary,
} from "../domain/types";

/** 浏览器预览（无 Electron 主进程）时的固定 diff 签名，恒定值可避免触发多余的刷新。 */
const BROWSER_PREVIEW_SIGNATURE = "browser-preview";

interface LoadReviewDiffOptions {
  /** 审查上下文，仅用于确定当前项目路径。 */
  session: ReviewSession;
  /** 当前选择的对比模式。 */
  mode: CompareMode;
  /** 分支对比模式使用的目标分支。 */
  targetBranch: string;
}

export async function loadReviewSessions(): Promise<ReviewSession[]> {
  try {
    return await window.navo.review.loadSessions();
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      // 浏览器预览没有主进程会话数据，回退为空列表。
      return [];
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export function onReviewSessionsChanged(listener: (sessions: ReviewSession[]) => void) {
  try {
    return window.navo.review.onSessionsChanged(listener);
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return () => undefined;
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export async function markReviewSessionRead(session: ReviewSession): Promise<void> {
  try {
    await window.navo.review.markSessionRead({
      sessionId: session.id,
      updatedAt: session.updatedAt,
    });
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return;
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

/** 归档会话：删除其本地审查记录；浏览器预览环境下保持 no-op。 */
export async function archiveReviewSession(session: ReviewSession): Promise<void> {
  try {
    await window.navo.review.archiveSession({ sessionId: session.id });
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return;
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

/** 浏览器预览没有 Git 能力时的提交面板状态：全部为零，入口自然置灰。 */
const EMPTY_COMMIT_STATUS: GitCommitStatus = {
  branchName: "",
  isDetached: false,
  hasUpstream: false,
  aheadCount: 0,
  stagedFileCount: 0,
  unstagedFileCount: 0,
  stagedAdditions: 0,
  stagedDeletions: 0,
  unstagedAdditions: 0,
  unstagedDeletions: 0,
};

interface LoadGitCommitStatusOptions {
  /** 提交弹窗需要的增删统计；按钮组后台刷新时关闭。 */
  includeDiffStats?: boolean;
}

export async function loadGitCommitStatus(
  projectPath: string,
  options: LoadGitCommitStatusOptions = {},
): Promise<GitCommitStatus> {
  try {
    return await window.navo.review.getCommitStatus({
      projectPath,
      includeDiffStats: options.includeDiffStats,
    });
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return EMPTY_COMMIT_STATUS;
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export async function commitGitChanges(projectPath: string, message: string, includeUnstaged: boolean): Promise<void> {
  await window.navo.review.commitChanges({ projectPath, message, includeUnstaged });
}

export async function pushGitCommits(projectPath: string): Promise<void> {
  await window.navo.review.pushCommits({ projectPath });
}

/** 清理本地缓存；浏览器预览环境下返回空结果。 */
export async function cleanReviewStorage(): Promise<CleanReviewStorageResult> {
  try {
    return await window.navo.review.cleanStorage();
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return { removedItems: 0, freedBytes: 0 };
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export interface ReviewDiffLoadResult {
  /** 解析后的 diff 汇总。 */
  summary: ReviewSummary;
  /** 与主进程一致的 diff 内容签名，用于检测工作区是否变化。 */
  signature: string;
}

export async function loadReviewDiff({ session, mode, targetBranch }: LoadReviewDiffOptions): Promise<ReviewDiffLoadResult> {
  try {
    const output = await window.navo.review.runGitDiff({
      projectPath: session.projectPath,
      mode,
      targetBranch,
    });

    if (!output.stdout.trim()) {
      return {
        summary: emptySummary(),
        signature: output.signature,
      };
    }

    return {
      summary: parseGitDiff(
        output.stdout,
        createDiffCacheKeyPrefix(session, mode, targetBranch),
        output.file_snapshots,
      ),
      signature: output.signature,
    };
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      // 浏览器预览或 preload 未注入时回退为空 diff，避免纯前端调试被 Electron IPC 阻断。
      return {
        summary: emptySummary(),
        signature: BROWSER_PREVIEW_SIGNATURE,
      };
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export async function loadReviewDiffSignature({
  session,
  mode,
  targetBranch,
}: LoadReviewDiffOptions): Promise<string> {
  try {
    return await window.navo.review.getGitDiffSignature({
      projectPath: session.projectPath,
      mode,
      targetBranch,
    });
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return BROWSER_PREVIEW_SIGNATURE;
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export async function loadUntrackedFileCount(projectPath: string): Promise<number> {
  try {
    return await window.navo.review.getUntrackedFileCount({ projectPath });
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return 0;
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export function watchProject(projectPath: string): Promise<void> {
  try {
    return window.navo.review.watchProject({ projectPath });
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return Promise.resolve();
    }

    return Promise.reject(new Error(error instanceof Error ? error.message : String(error)));
  }
}

export function unwatchProject(projectPath: string): Promise<void> {
  try {
    return window.navo.review.unwatchProject({ projectPath });
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return Promise.resolve();
    }

    return Promise.reject(new Error(error instanceof Error ? error.message : String(error)));
  }
}

export function onProjectChanged(listener: (projectPath: string) => void) {
  try {
    return window.navo.review.onProjectChanged(listener);
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return () => undefined;
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export async function loadLocalBranches(projectPath: string): Promise<string[]> {
  try {
    const branches = await window.navo.review.loadLocalBranches(projectPath);
    return branches.length > 0 ? branches : ["main", "master"];
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      // 本地预览没有 Electron API 时提供固定分支，保证分支菜单仍可交互。
      return ["main", "master"];
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export async function runReviewFileAction(
  projectPath: string,
  filePath: string,
  action: ReviewFileAction,
): Promise<void> {
  try {
    await window.navo.review.runFileAction({
      action,
      filePath,
      projectPath,
    });
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      // 浏览器预览没有 Git 写能力，点击文件操作时保持 no-op，避免 mock 预览报错。
      return;
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export async function runReviewBatchFileAction(
  projectPath: string,
  filePaths: string[],
  action: ReviewBatchFileAction,
): Promise<void> {
  try {
    await window.navo.review.runBatchFileAction({
      action,
      filePaths,
      projectPath,
    });
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      // 浏览器预览没有 Git 写能力，点击批量文件操作时保持 no-op。
      return;
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

/**
 * 稳定前缀：只含会话与对比方式。
 * 单文件内容变化由 parseGitDiff 内按文件 patch 再哈希，避免整表 cacheKey 抖动。
 */
function createDiffCacheKeyPrefix(session: ReviewSession, mode: CompareMode, targetBranch: string) {
  return `${session.id}-${mode}-${targetBranch}`;
}

function emptySummary(): ReviewSummary {
  return {
    files: [],
    additions: 0,
    deletions: 0,
    fileCount: 0,
    isLargeDiff: false,
  };
}

function isElectronApiUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("navo") || message.includes("is not a function");
}
