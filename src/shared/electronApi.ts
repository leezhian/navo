import type { GitFileSnapshot } from "../domain/diffParser";
import type { CompareMode, ReviewBatchFileAction, ReviewFileAction } from "../domain/types";

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

export interface RunReviewBatchFileActionParams {
  projectPath: string;
  filePaths: string[];
  action: ReviewBatchFileAction;
}

export type ExternalLinkTarget = "website" | "report-bug";

export interface AppInfo {
  /** 展示在关于页中的应用名称。 */
  name: string;
  /** package.json 中的当前应用版本。 */
  version: string;
}

export interface CheckForUpdatesResult {
  /** 是否存在可用的新版本；当前未接入更新服务时固定为 false。 */
  hasUpdate: boolean;
  /** 展示给用户的检查结果文案。 */
  message: string;
}

export type WindowFullScreenListener = (isFullScreen: boolean) => void;

export interface VibeReviewerApi {
  app: {
    /** 读取关于页所需的应用基础信息。 */
    getInfo(): Promise<AppInfo>;
    /** 打开关于页中的官方链接，只允许主进程白名单内的目标。 */
    openExternalLink(target: ExternalLinkTarget): Promise<void>;
    /** 检查更新入口；后续接入自动更新服务时保持 API 不变。 */
    checkForUpdates(): Promise<CheckForUpdatesResult>;
  };
  review: {
    runGitDiff(params: LoadReviewDiffParams): Promise<GitCommandOutput>;
    loadLocalBranches(projectPath: string): Promise<string[]>;
    openFileInVsCode(params: OpenFileInVsCodeParams): Promise<void>;
    runBatchFileAction(params: RunReviewBatchFileActionParams): Promise<void>;
    runFileAction(params: RunReviewFileActionParams): Promise<void>;
  };
  window: {
    /** 读取当前窗口是否处于 macOS 系统全屏。 */
    getIsFullScreen(): Promise<boolean>;
    /** 监听系统全屏状态变化；返回取消监听函数。 */
    onFullScreenChange(listener: WindowFullScreenListener): () => void;
  };
}
