import { parseGitDiff } from "../domain/diffParser";
import { mockRawDiff, mockSessions } from "../domain/mockData";
import type {
  AgentStatus,
  AgentType,
  CompareMode,
  ReviewBatchFileAction,
  ReviewFileAction,
  ReviewSession,
  ReviewSummary,
} from "../domain/types";

interface LoadReviewDiffOptions {
  /** 当前审查会话，用于读取项目路径和上轮对话 patch 引用。 */
  session: ReviewSession;
  /** 当前选择的对比模式。 */
  mode: CompareMode;
  /** 分支对比模式使用的目标分支。 */
  targetBranch: string;
}

export async function loadReviewSessions(): Promise<ReviewSession[]> {
  try {
    return await window.vibeReviewer.review.loadSessions();
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return mockSessions;
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export function onReviewSessionsChanged(listener: (sessions: ReviewSession[]) => void) {
  try {
    return window.vibeReviewer.review.onSessionsChanged(listener);
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return () => undefined;
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export async function markReviewSessionRead(session: ReviewSession): Promise<void> {
  try {
    await window.vibeReviewer.review.markSessionRead({
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

export async function loadAgentIntegrationStatuses(): Promise<Partial<Record<AgentType, AgentStatus>>> {
  try {
    return await window.vibeReviewer.review.loadAgentIntegrationStatuses();
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return {};
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export async function setAgentIntegrationEnabled(agent: AgentType, enabled: boolean): Promise<void> {
  try {
    await window.vibeReviewer.review.setAgentIntegrationEnabled({ agent, enabled });
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return;
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
    const output = await window.vibeReviewer.review.runGitDiff({
      projectPath: session.projectPath,
      mode,
      rawDiffPath: session.rawDiffPath,
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
      // 浏览器预览或 preload 未注入时使用 mock，避免纯前端调试被 Electron IPC 阻断。
      const summary = mockSummary();
      return {
        summary,
        signature: `mock:${summary.fileCount}`,
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
    return await window.vibeReviewer.review.getGitDiffSignature({
      projectPath: session.projectPath,
      mode,
      rawDiffPath: session.rawDiffPath,
      targetBranch,
    });
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return `mock:${mode}`;
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export async function loadUntrackedFileCount(projectPath: string): Promise<number> {
  try {
    return await window.vibeReviewer.review.getUntrackedFileCount({ projectPath });
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return 0;
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export function watchProject(projectPath: string): Promise<void> {
  try {
    return window.vibeReviewer.review.watchProject({ projectPath });
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return Promise.resolve();
    }

    return Promise.reject(new Error(error instanceof Error ? error.message : String(error)));
  }
}

export function unwatchProject(projectPath: string): Promise<void> {
  try {
    return window.vibeReviewer.review.unwatchProject({ projectPath });
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return Promise.resolve();
    }

    return Promise.reject(new Error(error instanceof Error ? error.message : String(error)));
  }
}

export function onProjectChanged(listener: (projectPath: string) => void) {
  try {
    return window.vibeReviewer.review.onProjectChanged(listener);
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      return () => undefined;
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

export async function loadLocalBranches(projectPath: string): Promise<string[]> {
  try {
    const branches = await window.vibeReviewer.review.loadLocalBranches(projectPath);
    return branches.length > 0 ? branches : ["main", "master"];
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      // 本地预览没有 Electron API 时提供固定分支，保证分支菜单仍可交互。
      return ["main", "master", "feature/review-ui", "live-play-route"];
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
    await window.vibeReviewer.review.runFileAction({
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
    await window.vibeReviewer.review.runBatchFileAction({
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

export function mockSummary(): ReviewSummary {
  return parseGitDiff(mockRawDiff, "mock-review-diff");
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
  return message.includes("vibeReviewer") || message.includes("is not a function");
}
