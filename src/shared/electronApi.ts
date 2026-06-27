import type { GitFileSnapshot } from "../domain/diffParser";
import type { CompareMode, ReviewFileAction } from "../domain/types";

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

export interface RunReviewFileActionParams {
  projectPath: string;
  filePath: string;
  action: ReviewFileAction;
}

export type WindowFullScreenListener = (isFullScreen: boolean) => void;

export interface VibeReviewerApi {
  review: {
    runGitDiff(params: LoadReviewDiffParams): Promise<GitCommandOutput>;
    loadLocalBranches(projectPath: string): Promise<string[]>;
    openFileInVsCode(params: OpenFileInVsCodeParams): Promise<void>;
    runFileAction(params: RunReviewFileActionParams): Promise<void>;
  };
  window: {
    /** 读取当前窗口是否处于 macOS 系统全屏。 */
    getIsFullScreen(): Promise<boolean>;
    /** 监听系统全屏状态变化；返回取消监听函数。 */
    onFullScreenChange(listener: WindowFullScreenListener): () => void;
  };
}
