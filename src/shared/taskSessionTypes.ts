import type { TaskAgentSelection } from "./agentCapabilities";
import type { AgentId } from "./agentTypes";

export type TaskSessionStatus = "starting" | "running" | "stopped" | "failed";
export interface TaskSession {
  id: string;
  taskId: string;
  kind: "agent" | "shell";
  /** CLI 元数据中的真实名称；尚未生成或无法精确匹配时为空。 */
  title: string;
  /** 区分 CLI 标题与早期版本的自动编号名称，避免误清理真实同名标题。 */
  titleSource?: "cli";
  /** Navo 内归档时间；归档保留会话记录，但不再运行或出现在活动列表。 */
  archivedAt?: string;
  cwd: string;
  agent?: TaskAgentSelection;
  status: TaskSessionStatus;
  /** 每次启动生成新的 PTY 标识，重启不复用已结束的终端缓冲。 */
  terminalId: string;
  nativeSessionId?: string;
  /** 原生历史的实际根目录，防止配置变更后误操作另一个目录。 */
  nativeHistoryRoot?: string;
  resumable: boolean;
  createdAt: string;
  error?: string;
}

export interface StartTaskSessionInput {
  taskId: string;
  kind: "agent" | "shell";
  /** 只允许任务已关联的资源；省略时单目录任务使用该目录，否则使用任务目录。 */
  resourceId?: string;
  agent?: TaskAgentSelection;
  /** 快捷新建仅提交 Agent 标识，默认配置由主进程从真实能力缓存解析。 */
  agentId?: AgentId;
}

export interface TaskSessionsApi {
  list(): Promise<TaskSession[]>;
  start(input: StartTaskSessionInput): Promise<TaskSession[]>;
  stop(id: string): Promise<TaskSession[]>;
  archive(id: string): Promise<TaskSession[]>;
  rename(id: string, title: string): Promise<TaskSession[]>;
  remove(id: string): Promise<TaskSession[]>;
  restart(id: string, resume: boolean): Promise<TaskSession[]>;
  onChanged(listener: (sessions: TaskSession[]) => void): () => void;
  /** 通过已存储的任务及附件标识定位，不接受任意文件路径。 */
  revealAttachment(taskId: string, attachmentId: string): Promise<void>;
  openLink(taskId: string, linkId: string): Promise<void>;
}
