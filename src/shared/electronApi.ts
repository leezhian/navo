import type { GitFileSnapshot } from "../domain/diffParser";
import type { TasksApi } from "./taskTypes";
import type { AgentsApi } from "./agentTypes";
import type { RendererDiagnosticReport } from "./diagnosticTypes";
import type { CloneProgress, CloneResourceParams, ResourceRecord, SaveResourceParams, SettingsBootstrap } from "./settingsTypes";
import type { AppSettings, CompareMode, ReviewBatchFileAction, ReviewFileAction, ReviewSession } from "../domain/types";
import type {
  CreateTerminalParams,
  ResizeTerminalParams,
  TerminalDataListener,
  TerminalExitListener,
  TerminalSessionParams,
  WriteTerminalParams,
} from "./terminalTypes";

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

export interface MarkReviewSessionReadParams {
  sessionId: string;
  updatedAt: string;
}

export interface ArchiveReviewSessionParams {
  /** 复合会话 id（provider:sessionId），与会话列表条目 id 一致。 */
  sessionId: string;
}

export interface GitCommitStatus {
  /** 当前分支名；detached 状态下为 git 返回的占位值。 */
  branchName: string;
  isDetached: boolean;
  hasUpstream: boolean;
  /** 可推送的本地提交数；有 upstream 时为领先数，无 upstream 时为当前分支提交总数。 */
  aheadCount: number;
  stagedFileCount: number;
  /** 未暂存文件数，含未跟踪与冲突文件。 */
  unstagedFileCount: number;
  /** 已跟踪文件口径的增删行数，供提交弹窗展示。 */
  stagedAdditions: number;
  stagedDeletions: number;
  unstagedAdditions: number;
  unstagedDeletions: number;
}

export interface CommitChangesParams {
  projectPath: string;
  message: string;
  /** 为 true 时提交前先暂存全部改动（含未跟踪文件）。 */
  includeUnstaged: boolean;
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

export interface GetCommitStatusParams {
  /** 需要读取状态的本地 Git 项目根路径。 */
  projectPath: string;
  /** 是否同时读取增删行统计；提交按钮组刷新时可关闭以减少 Git diff 扫描。 */
  includeDiffStats?: boolean;
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

export interface NavoApi {
  agents: AgentsApi;
  diagnostics: {
    /** 报告受限异常，由主进程脱敏；不提供路径或任意对象写入能力。 */
    report(report: RendererDiagnosticReport): Promise<void>;
  };
  tasks: TasksApi;
  settings: {
    /** 读取磁盘配置及主进程提供的当前日志文件路径。 */
    load(): Promise<SettingsBootstrap>;
    /** 原子写入配置，失败时拒绝而非伪造成功。 */
    save(settings: AppSettings): Promise<AppSettings>;
    /** 从当前用户主目录打开系统目录选择器，取消时返回 null。 */
    chooseDirectory(): Promise<string | null>;
    /** 选择日志所在目录，返回保留当前文件名的新路径；取消时返回 null。 */
    chooseLogFile(): Promise<string | null>;
    /** 在系统文件管理器中定位当前日志文件。 */
    revealLogFile(): Promise<void>;
    /** 清空当前诊断日志文件，不删除目录和其他文件。 */
    clearLogs(): Promise<void>;
    /** 查询诊断日志写入是否失败，不暴露日志正文。 */
    getLogsStatus(): Promise<{ failed: boolean }>;
  };
  resources: {
    list(): Promise<ResourceRecord[]>;
    save(params: SaveResourceParams): Promise<ResourceRecord>;
    remove(id: string): Promise<void>;
    clone(params: CloneResourceParams): Promise<ResourceRecord>;
    cancelClone(operationId: string): Promise<void>;
    onCloneProgress(listener: (progress: CloneProgress) => void): () => void;
    /** 在 preload 解析拖入文件的真实路径，不向渲染进程开放 fs。 */
    getDroppedPath(file: File): string;
  };
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
    /** 归档历史会话：删除该会话的本地审查记录（事件、patch 与已读状态）。 */
    archiveSession(params: ArchiveReviewSessionParams): Promise<void>;
    /** 清理不在会话列表中的本地缓存（孤儿 diff、超龄 pending 基线与日志等）。 */
    cleanStorage(): Promise<CleanReviewStorageResult>;
    /** 读取提交面板所需的 Git 状态（暂存/未暂存/未推送/分支）。 */
    getCommitStatus(params: GetCommitStatusParams): Promise<GitCommitStatus>;
    /** 提交更改；includeUnstaged 时先暂存全部改动。 */
    commitChanges(params: CommitChangesParams): Promise<void>;
    /** 推送未推送提交；无 upstream 时自动 -u origin 当前分支。 */
    pushCommits(params: ProjectPathParams): Promise<void>;
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
  terminal: {
    /** 创建一个与窗口绑定的 PTY 会话。 */
    create(params: CreateTerminalParams): Promise<void>;
    /** 向指定 PTY 写入键盘或粘贴输入。 */
    write(params: WriteTerminalParams): Promise<void>;
    /** 更新指定 PTY 的列数和行数。 */
    resize(params: ResizeTerminalParams): Promise<void>;
    /** 销毁指定 PTY 会话并释放主进程资源。 */
    destroy(params: TerminalSessionParams): Promise<void>;
    /** 订阅 PTY 输出；返回取消订阅函数。 */
    onData(listener: TerminalDataListener): () => void;
    /** 订阅 Shell 退出事件；返回取消订阅函数。 */
    onExit(listener: TerminalExitListener): () => void;
  };
  window: {
    /** 读取当前窗口是否处于 macOS 系统全屏。 */
    getIsFullScreen(): Promise<boolean>;
    /** 监听系统全屏状态变化；返回取消监听函数。 */
    onFullScreenChange(listener: WindowFullScreenListener): () => void;
  };
}
