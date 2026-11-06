import type { IssueItem } from "../domain/issues";
import type { TaskBranchSnapshot } from "./taskBranchTypes";
import type { TaskAgentSelection } from "./agentCapabilities";
import type { Task, TaskStatus } from "../domain/tasks";
import type { AddTaskResourcesInput, TaskFileReference, TaskNoteUpdate } from "./taskResourceTypes";
import type { WorkspaceOpenOptions, WorkspaceOpenTarget } from "./workspaceOpenTypes";
import type { TaskDeletionConfirmation, TaskDeletionOptions, TaskDeletionPreview, TaskWorktreeDeletionPreview } from "./taskDeletionTypes";

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
  /** 仅传输用于展示的缩略图，不将原文件二进制写入数据库。 */
  preview?: string;
}

export interface TaskWebLink {
  id: string;
  /** 独立网页链接，不自动转换为 Issue 或 PR。 */
  url: string;
  /** 空字符串时使用 URL 作为展示名称。 */
  title: string;
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
  workspaceOpenOptions(taskId: string, resourceId: string): Promise<WorkspaceOpenOptions>;
  openWorkspace(taskId: string, resourceId: string, target: WorkspaceOpenTarget): Promise<void>;
  addResources(taskId: string, input: AddTaskResourcesInput): Promise<Task>;
  /** 仅修改指定任务的笔记，必须提交编辑开始时的笔记版本。 */
  updateNote(taskId: string, note: TaskNoteUpdate, expectedVersion: number): Promise<Task>;
  updatePrompt(taskId: string, content: string, expected: string): Promise<Task>;
  detachResource(taskId: string, input: import("./taskContextTypes").TaskResourceRemoval): Promise<Task>;
  /** 检查指定 Worktree；删除必须提交本窗口获得的确认凭据。 */
  inspectWorktreeDeletion(taskId: string, resourceId: string): Promise<TaskWorktreeDeletionPreview>;
  deleteWorktree(taskId: string, resourceId: string, confirmation: TaskDeletionConfirmation): Promise<Task>;
  retryInitialization(taskId: string): Promise<void>;
  onChanged(listener: (task: Task) => void): () => void;
  /** 使用打开删除确认时的版本，避免删除确认期间被其他会话更新的笔记。 */
  deleteNote(taskId: string, noteId: string, expectedVersion: number): Promise<Task>;
  chooseResourceFile(): Promise<TaskFileReference | null>;
  releaseResourceFiles(ids: string[]): Promise<void>;
  revealResourceFile(taskId: string, fileId: string): Promise<void>;
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
