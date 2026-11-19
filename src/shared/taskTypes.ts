import type { IssueItem } from "../domain/issues";
import type { TaskBranchSnapshot } from "./taskBranchTypes";
import type { ChangeGitStatus } from "./changeGitStatus";
import type { TaskAgentSelection } from "./agentCapabilities";
import type { Task, TaskStatus } from "../domain/tasks";
import type { AddTaskResourcesInput, TaskFileReference, TaskNoteUpdate } from "./taskResourceTypes";
import type { TaskFileInspect, TaskFilePreview, TaskManagedFileKind, TaskResourceBatchResult, TaskResourceCleanupPlan, TaskResourceRef } from "./taskResourceLifecycle";
import type { WorkspaceOpenOptions, WorkspaceOpenTarget } from "./workspaceOpenTypes";
import type { TaskDeletionConfirmation, TaskDeletionOptions, TaskDeletionPreview, TaskWorktreeDeletionPreview } from "./taskDeletionTypes";
import type { TaskNoteCommentInput, TaskNoteVersion } from "./taskNoteTypes";

export type TaskExecutionMode = "worktree" | "new-branch" | "current-branch" | "folder";

export interface BranchOption {
  name: string;
  ref: string;
  kind: "local" | "remote";
}

export interface TaskResourceInfo {
  resourceId: string;
  name: string;
  path: string;
  /** 普通目录为 null；不根据资源记录的 kind 猜测 Git 能力。 */
  git: { root: string; branches: BranchOption[]; currentBranch: string; defaultSource: string; worktrees?: { path: string; branch: string; isMain: boolean }[] } | null;
}

export interface TaskResourceInput {
  /** 全局仓库或文件夹 ID，不是任务内工作区 ID。 */
  resourceId: string;
  mode: TaskExecutionMode;
  sourceBranch: string;
  /** 空字符串表示使用设置前缀 + navo-task- + 8 位随机十六进制字符。 */
  targetBranch: string;
  /** 使用所选已有分支，而不是从源分支创建新分支。 */
  useExistingBranch?: boolean;
}

export interface TaskResource extends Omit<TaskResourceInput, "resourceId"> {
  /** 任务内工作区的稳定 ID；首个绑定可沿用全局 ID，其他工作区使用独立 ID。 */
  resourceId: string;
  /** 全局仓库或文件夹 ID。旧数据未提供时与 resourceId 相同。 */
  repositoryId?: string;
  name: string;
  originalPath: string;
  workingPath: string;
  /** 工作目录实际绑定时间；旧记录缺省时不推断。 */
  addedAt?: string;
  /** 创建成功时记录的文件系统身份；旧记录缺失时不推断可删除归属。 */
  ownership?: {
    path: string; directoryId: string; gitDirectory: string; commonDirectory: string; commonDirectoryId: string; branchCreated?: boolean;
    /** 创建时写入 Git 的唯一锁原因，仅允许清理由 Navo 自己设置且仍匹配的锁。 */
    lockReason?: string;
  };
}

export interface TaskAttachment {
  id: string;
  name: string;
  size: number;
  description?: string;
  /** 资源级归档时间；归档后退出活动列表和共享上下文。 */
  archivedAt?: string;
  /** 仅传输用于展示的缩略图，不将原文件二进制写入数据库。 */
  preview?: string;
}

export interface TaskWebLink {
  id: string;
  /** 独立网页链接，不自动转换为 Issue 或 PR。 */
  url: string;
  /** 空字符串时使用 URL 作为展示名称。 */
  title: string;
  /** 资源级归档时间；归档后退出活动列表和共享上下文。 */
  archivedAt?: string;
}

export interface CreateTaskInput {
  /** 可选的任务级 Agent 配置；保存成功后独立启动首个 CLI，失败不回滚任务。 */
  agent?: TaskAgentSelection;
  /** 同一草稿重试复用标识，防止提交成功但响应丢失后重复创建。 */
  requestId: string;
  description: string;
  resources: TaskResourceInput[];
  links: IssueItem[];
  /** 普通链接与带状态的 Issue/PR 关联分开保存；旧调用可不传。 */
  webLinks?: TaskWebLink[];
  /** 系统文件选择器签发的标识，不接收任意磁盘路径。 */
  attachmentIds: string[];
}

export interface TaskBootstrap {
  /** null 允许旧任务迁移；空数组表示已初始化但没有任务。 */
  tasks: Task[] | null;
  recoveryWarnings: string[];
}

export interface TasksApi {
  /** 只读获取任务关联仓库的分支、文件统计与提交列表。 */
  loadBranch(taskId: string, resourceId: string): Promise<TaskBranchSnapshot>;
  /** 只读读取已关联工作区的 Git 状态，供 CHANGES 悬停卡使用。 */
  inspectChangeGitStatus(taskId: string, resourceId: string): Promise<ChangeGitStatus>;
  workspaceOpenOptions(taskId: string, resourceId: string): Promise<WorkspaceOpenOptions>;
  openWorkspace(taskId: string, resourceId: string, target: WorkspaceOpenTarget): Promise<void>;
  addResources(taskId: string, input: AddTaskResourcesInput): Promise<Task>;
  /** 仅修改指定任务的笔记，必须提交编辑开始时的笔记版本。 */
  updateNote(taskId: string, note: TaskNoteUpdate, expectedVersion: number): Promise<Task>;
  updatePrompt(taskId: string, content: string, expected: string, expectedVersion?: number): Promise<Task>;
  /** 读取真实保存版本；恢复创建新版本并检查当前版本。 */
  noteHistory(taskId: string, noteId: string): Promise<TaskNoteVersion[]>;
  restoreNote(taskId: string, noteId: string, version: number, expectedVersion: number): Promise<Task>;
  /** 评论锚定保存版本及原文，写入成功后进入任务上下文。 */
  commentNote(taskId: string, input: TaskNoteCommentInput): Promise<Task>;
  changeNoteComment(taskId: string, commentId: string, expectedUpdatedAt: string, patch: { body?: string; resolved?: boolean; remove?: boolean }): Promise<Task>;
  /** 将指定笔记或任务正文另存为 Markdown；目标路径由系统保存面板选择，取消返回 false。 */
  exportNote(taskId: string, noteId: string, version?: number): Promise<boolean>;
  detachResource(taskId: string, input: import("./taskContextTypes").TaskResourceRemoval): Promise<Task>;
  /** 检查指定 Worktree；删除必须提交本窗口获得的确认凭据。 */
  inspectWorktreeDeletion(taskId: string, resourceId: string): Promise<TaskWorktreeDeletionPreview>;
  deleteWorktree(taskId: string, resourceId: string, confirmation: TaskDeletionConfirmation): Promise<Task>;
  retryInitialization(taskId: string): Promise<void>;
  onChanged(listener: (task: Task) => void): () => void;
  /** 使用打开删除确认时的版本，避免删除确认期间被其他会话更新的笔记。 */
  deleteNote(taskId: string, noteId: string, expectedVersion: number): Promise<Task>;
  /** 普通笔记软删除；每一项都按确认时版本校验，失败整批回滚。 */
  deleteNotes(taskId: string, notes: import("./taskResourceTypes").TaskNoteRemoval[]): Promise<Task>;
  /** 回收列表不混入活动资源或共享上下文；归档任务也可只读查看。 */
  deletedNotes(taskId: string): Promise<import("./taskResourceTypes").TaskNote[]>;
  /** 恢复到活动列表；可选历史版本，恢复生成新版本而非覆盖历史。 */
  restoreDeletedNote(taskId: string, noteId: string, expectedVersion: number, version?: number): Promise<Task>;
  chooseResourceFile(): Promise<TaskFileReference | null>;
  releaseResourceFiles(ids: string[]): Promise<void>;
  revealResourceFile(taskId: string, fileId: string): Promise<void>;
  inspectManagedFile(taskId: string, kind: TaskManagedFileKind, fileId: string): Promise<TaskFileInspect>;
  previewManagedFile(taskId: string, kind: TaskManagedFileKind, fileId: string): Promise<TaskFilePreview>;
  updateFileMeta(taskId: string, kind: TaskManagedFileKind, fileId: string, patch: { name?: string; description?: string }): Promise<Task>;
  saveFileCopy(taskId: string, kind: TaskManagedFileKind, fileId: string): Promise<boolean>;
  updateWebLink(taskId: string, linkId: string, title: string): Promise<Task>;
  archiveResources(taskId: string, items: TaskResourceRef[]): Promise<TaskResourceBatchResult>;
  restoreResources(taskId: string, items: TaskResourceRef[]): Promise<TaskResourceBatchResult>;
  detachResources(taskId: string, items: TaskResourceRef[]): Promise<TaskResourceBatchResult>;
  deleteAttachments(taskId: string, ids: string[]): Promise<TaskResourceBatchResult>;
  inspectResourceCleanup(taskId: string): Promise<TaskResourceCleanupPlan>;
  applyResourceCleanup(taskId: string): Promise<TaskResourceBatchResult>;
  undoResourceChange(taskId: string): Promise<Task>;
  dismissResourceUndo(taskId: string): Promise<void>;
  load(): Promise<TaskBootstrap>;
  importLegacy(tasks: Task[]): Promise<Task[]>;
  create(input: CreateTaskInput): Promise<Task>;
  inspectResource(resourceId: string): Promise<TaskResourceInfo>;
  chooseFiles(): Promise<TaskAttachment[]>;
  releaseFiles(ids: string[]): Promise<void>;
  previewAttachment(taskId: string, attachmentId: string): Promise<string | null>;
  rename(id: string, title: string): Promise<Task[]>;
  move(id: string, status: TaskStatus, beforeTaskId: string | null): Promise<Task[]>;
  restore(id: string): Promise<Task[]>;
  /** 归档保留任务与会话；清理选项须使用归档专属预检查凭据。 */
  archive(id: string, confirmation: TaskDeletionConfirmation): Promise<Task[]>;
  inspectDeletion(id: string, options: TaskDeletionOptions, action?: import("./taskDeletionTypes").TaskCleanupAction): Promise<TaskDeletionPreview>;
  remove(id: string, confirmation?: TaskDeletionConfirmation): Promise<Task[]>;
}
