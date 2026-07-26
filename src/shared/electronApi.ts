import type { GitFileSnapshot } from "../domain/diffParser";
import type { AgentStatus, AgentType, CompareMode, ReviewBatchFileAction, ReviewFileAction, ReviewSession } from "../domain/types";

export interface GitCommandOutput {
  stdout: string;
  stderr: string;
  file_snapshots: GitFileSnapshot[];
  /** 当前 diff 内容签名；用于检测工作区改动后是否需要刷新。 */
  signature: string;
}

export interface LoadReviewDiffParams {
  projectPath: string;
  mode: CompareMode;
  targetBranch?: string;
  rawDiffPath?: string;
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

export interface SetAgentIntegrationParams {
  agent: AgentType;
  enabled: boolean;
}

export interface MarkReviewSessionReadParams {
  sessionId: string;
  updatedAt: string;
}

export interface ArchiveReviewSessionParams {
  /** 复合会话 id（provider:sessionId），与会话列表条目 id 一致。 */
  sessionId: string;
}

export interface CleanReviewStorageResult {
  /** 本次清理删除的文件、目录与记录条数合计。 */
  removedItems: number;
  /** 释放的磁盘空间字节数。 */
  freedBytes: number;
}

export type ExternalLinkTarget = "website" | "report-bug";

export type ReviewSessionsChangedListener = (sessions: ReviewSession[]) => void;

export type ReviewProjectChangedListener = (projectPath: string) => void;

export interface ProjectPathParams {
  /** 需要监听或查询的本地 Git 项目根路径。 */
  projectPath: string;
}

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
    loadSessions(): Promise<ReviewSession[]>;
    markSessionRead(params: MarkReviewSessionReadParams): Promise<void>;
    /** 归档会话：删除该会话的本地审查记录（事件、patch 与已读状态）；进行中轮次结束后会重新入列。 */
    archiveSession(params: ArchiveReviewSessionParams): Promise<void>;
    /** 清理不在会话列表中的本地缓存（孤儿 diff、超龄 pending 基线与日志等）。 */
    cleanStorage(): Promise<CleanReviewStorageResult>;
    loadAgentIntegrationStatuses(): Promise<Partial<Record<AgentType, AgentStatus>>>;
    setAgentIntegrationEnabled(params: SetAgentIntegrationParams): Promise<void>;
    runGitDiff(params: LoadReviewDiffParams): Promise<GitCommandOutput>;
    /** 读取当前对比方式 diff 内容签名，用于检测工作区是否变化。 */
    getGitDiffSignature(params: LoadReviewDiffParams): Promise<string>;
    /** 统计未跟踪文件数（尊重 gitignore），供提示条使用。 */
    getUntrackedFileCount(params: ProjectPathParams): Promise<number>;
    loadLocalBranches(projectPath: string): Promise<string[]>;
    onSessionsChanged(listener: ReviewSessionsChangedListener): () => void;
    /** 监听项目工作区 / Git 元数据变化；返回取消监听函数。 */
    onProjectChanged(listener: ReviewProjectChangedListener): () => void;
    /** 开始监听指定项目的文件与 Git 元数据变化。 */
    watchProject(params: ProjectPathParams): Promise<void>;
    /** 停止监听指定项目（引用计数归零后关闭 watcher）。 */
    unwatchProject(params: ProjectPathParams): Promise<void>;
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
