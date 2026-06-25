import { parseGitDiff } from "../domain/diffParser";
import { mockRawDiff } from "../domain/mockData";
import type { CompareMode, ReviewSummary } from "../domain/types";

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
      return ["main", "master", "feature/review-ui", "live-play-route"];
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
