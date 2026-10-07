import type { IssueItem } from "../domain/issues";
import type { TaskAgentSelection } from "./agentCapabilities";
import type { Task, TaskStatus } from "../domain/tasks";
import type { TaskDeletionConfirmation, TaskDeletionOptions, TaskDeletionPreview } from "./taskDeletionTypes";

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
  git: { root: string; branches: BranchOption[]; currentBranch: string; defaultSource: string } | null;
}

export interface TaskResourceInput {
  resourceId: string;
  mode: TaskExecutionMode;
  sourceBranch: string;
  /** 空字符串表示使用设置前缀生成 8 位随机短名。 */
  targetBranch: string;
}

export interface TaskResource extends TaskResourceInput {
  name: string;
  originalPath: string;
  workingPath: string;
  /** 创建成功时记录的文件系统身份；旧记录缺失时不推断可删除归属。 */
  ownership?: { path: string; directoryId: string; gitDirectory: string; commonDirectory: string; commonDirectoryId: string };
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
  inspectDeletion(id: string, options: TaskDeletionOptions): Promise<TaskDeletionPreview>;
  remove(id: string, confirmation?: TaskDeletionConfirmation): Promise<Task[]>;
}
