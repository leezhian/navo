import type { TaskAgentSelection } from "./agentCapabilities";
import type { AgentId } from "./agentTypes";

export type TaskSessionStatus = "starting" | "running" | "stopped" | "failed";
/** 进程运行中时，按 Agent 能力矩阵从原生结构化记录确认的运行相位；不替代进程四态。 */
export type TaskSessionPhase = "answering" | "reasoning" | "executingTool" | "waitingModel" | "idle" | "waitingPermission";
export type TaskSessionWorkspace = { kind: "all" } | { kind: "resource"; resourceId: string; name: string; branch: string };
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
  /** dynamic 为任务 MCP（含笔记读写），file 为实时上下文文件；snapshot 用于旧会话或无法传递读取约定的 CLI。 */
  contextMode?: "dynamic" | "file" | "snapshot";
  /** 文件同步失败不停止 CLI，不表示模型已读取或未读取。 */
  contextSyncFailed?: boolean;
  cwd: string;
  /** 创建时绑定的工作范围快照；旧记录缺省，不根据后续资源数量猜测范围。 */
  workspace?: TaskSessionWorkspace;
  /** 手动执行的仓库命令；不保存脚本或在重启应用后自动重跑。 */
  command?: { id: string; resourceId: string; name: string };
  commandExitCode?: number;
  /** 初始化终端由协调器顺序执行，不通过手动命令入口重启。 */
  initialization?: boolean;
  agent?: TaskAgentSelection;
  status: TaskSessionStatus;
  /** 每次启动生成新的 PTY 标识，重启不复用已结束的终端缓冲。 */
  terminalId: string;
  nativeSessionId?: string;
  /** 新会话关联标识，用于核对无法预设 ID 的 CLI 原生记录，不按最近时间猜测。 */
  nativeLaunchId?: string;
  /** 本次新对话开始时间，仅用于缩小原生记录的核对范围。 */
  nativeLaunchAt?: string;
  /** 原生历史的实际根目录，防止配置变更后误操作另一个目录。 */
  nativeHistoryRoot?: string;
  resumable: boolean;
  /** 应用退出保留待恢复状态；用户停止、自然退出或失败时关闭自动恢复。 */
  resumeOnOpen?: boolean;
  createdAt: string;
  /** 会话元数据最近一次实际变更时间，不包含读取及终端缓冲回放。 */
  lastUpdateAt: string;
  /** 最近一次成功启动或实际 PTY 输入、输出的时间。 */
  lastActiveAt: string;
  /** CLI 原生记录中最近一次“回合完成”的时间；终端重绘不计入，作为未读依据。 */
  lastReplyAt?: string;
  /** CLI 原生记录中最近一次用户发起回合的时间；终端输入不计入。 */
  lastPromptAt?: string;
  /** 运行相位只在内存中维护，不落库；无能力或进程未运行时为空。 */
  phase?: TaskSessionPhase;
  /** 等待权限时事件给出的工具名；无原因字段时为空，不写占位。 */
  waitingReason?: string;
  /** 最近一条结构化用量；只在内存中，没有上下文窗口时不推算百分比，也不估算费用。 */
  usage?: SessionUsage;
  error?: string;
}

/** 来自 CLI 用量记录的非负整数。上下文窗口仅在该记录自己提供时存在。 */
export interface SessionUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  contextWindow?: number;
}

export interface StartTaskSessionInput {
  taskId: string;
  kind: "agent" | "shell";
  /** 任务内工作区 ID，不是全局仓库 ID；省略时单目录自动选择，null 使用全部资源。 */
  resourceId?: string | null;
  /** 从同任务会话沿用工作目录；仅 Agent 使用，与 resourceId 互斥，不复制历史和 Agent 配置。 */
  sourceSessionId?: string;
  agent?: TaskAgentSelection;
  /** 快捷新建仅提交 Agent 标识，默认配置由主进程从真实能力缓存解析。 */
  agentId?: AgentId;
  /** 仅 Shell 使用，必须同时指定任务工作区；实际脚本从本地仓库配置读取。 */
  commandId?: string;
}

export interface TaskSessionsApi {
  /** 刷新本会话上下文文件并返回读取提示，仅供复制，不发送终端输入。 */
  contextReminder(id: string): Promise<string>;
  list(): Promise<TaskSession[]>;
  /** 按需刷新当前任务未归档会话的原生标题，返回完整会话列表供共享视图同步。 */
  refreshTitles(taskId: string): Promise<TaskSession[]>;
  start(input: StartTaskSessionInput): Promise<TaskSession[]>;
  stop(id: string): Promise<TaskSession[]>;
  archive(id: string): Promise<TaskSession[]>;
  restore(id: string): Promise<TaskSession[]>;
  rename(id: string, title: string): Promise<TaskSession[]>;
  remove(id: string): Promise<TaskSession[]>;
  /** false 停止旧进程后重连原对话；true 仅恢复已停止会话。两者均不创建新对话。 */
  restart(id: string, resumeOnly: boolean): Promise<TaskSession[]>;
  /** 当前可见会话的自动恢复；已运行或不满足条件时幂等返回，不另建对话。 */
  resumeVisible(id: string): Promise<TaskSession[]>;
  onChanged(listener: (sessions: TaskSession[]) => void): () => void;
  /** 通过已存储的任务及附件标识定位，不接受任意文件路径。 */
  revealAttachment(taskId: string, attachmentId: string): Promise<void>;
  openLink(taskId: string, linkId: string): Promise<void>;
}
