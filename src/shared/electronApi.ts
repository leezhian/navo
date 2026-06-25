import type { GitFileSnapshot } from "../domain/diffParser";
import type { CompareMode } from "../domain/types";

export interface GitCommandOutput {
  stdout: string;
  stderr: string;
  file_snapshots: GitFileSnapshot[];
}

export interface LoadReviewDiffParams {
  projectPath: string;
  mode: CompareMode;
  targetBranch?: string;
}

export interface OpenFileInVsCodeParams {
  projectPath: string;
  filePath: string;
}

export interface VibeReviewerApi {
  review: {
    runGitDiff(params: LoadReviewDiffParams): Promise<GitCommandOutput>;
    loadLocalBranches(projectPath: string): Promise<string[]>;
    openFileInVsCode(params: OpenFileInVsCodeParams): Promise<void>;
  };
}
