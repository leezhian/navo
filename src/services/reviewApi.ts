import { parseGitDiff } from "../domain/diffParser";
import { mockRawDiff } from "../domain/mockData";
import type { CompareMode, ReviewBatchFileAction, ReviewFileAction, ReviewSummary } from "../domain/types";

export async function loadReviewDiff(
  projectPath: string,
  mode: CompareMode,
  targetBranch: string,
): Promise<ReviewSummary> {
  try {
    const output = await window.vibeReviewer.review.runGitDiff({
      projectPath,
      mode,
      targetBranch,
    });

    if (!output.stdout.trim()) {
      return emptySummary();
    }

    return parseGitDiff(output.stdout, `${projectPath}-${mode}-${targetBranch}`, output.file_snapshots);
  } catch (error) {
    if (isElectronApiUnavailable(error)) {
      // 浏览器预览或 preload 未注入时使用 mock，避免纯前端调试被 Electron IPC 阻断。
      return mockSummary();
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
