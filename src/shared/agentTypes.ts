import type { CreateTerminalParams } from "./terminalTypes";
import type { AgentCapabilities, AgentCapabilitySnapshot } from "./agentCapabilities";

export const AGENT_IDS = ["claude", "codex", "grok", "antigravity"] as const;
export type AgentId = typeof AGENT_IDS[number];
export type AgentAction = "install" | "update" | "login" | "logout" | "manageLogin";

export interface AgentConfiguration {
  id: AgentId;
  enabled: boolean;
  /** 空值表示自动查找本机 CLI。 */
  customPath: string;
  args: string[];
  /** 只返回变量名称，已保存的值不回传渲染进程。 */
  environmentNames: string[];
}

export interface SaveAgentConfiguration {
  id: AgentId;
  enabled: boolean;
  customPath: string;
  args: string[];
  /** 不传 value 保留同名已保存值；删除条目才删除变量。 */
  environment: Array<{ name: string; value?: string }>;
}

export interface AgentInstallation {
  id: AgentId;
  status: "installed" | "missing" | "error";
  binaryPath: string | null;
  version: string | null;
  source: "custom" | "path" | "common" | null;
  auth: "signedIn" | "signedOut" | "unknown";
  identity?: string;
  /** 仅包含当前主机、安装方式确实支持的操作。 */
  actions: AgentAction[];
}

export interface AgentSettingsSnapshot {
  defaultAgent: AgentId | null;
  configurations: AgentConfiguration[];
  secureStorageAvailable: boolean;
}

export interface AgentOperationPlan {
  /** 主进程签发、绑定窗口且只可消费一次的短期凭据。 */
  token: string;
  id: AgentId;
  action: AgentAction;
  /** 仅展示受控命令，不包含环境变量或认证信息。 */
  command: string;
}

export interface AgentsApi {
  load(): Promise<AgentSettingsSnapshot>;
  scan(): Promise<AgentInstallation[]>;
  capabilities(id: AgentId): Promise<AgentCapabilities>;
  /** 只读取本地快照，不检测 CLI 或检查缓存过期。 */
  capabilitySnapshot(): Promise<AgentCapabilitySnapshot>;
  onCapabilitiesChanged(listener: () => void): () => void;
  save(input: SaveAgentConfiguration): Promise<AgentSettingsSnapshot>;
  setDefault(id: AgentId | null): Promise<AgentSettingsSnapshot>;
  chooseBinary(): Promise<string | null>;
  openDocumentation(id: AgentId): Promise<void>;
  prepare(id: AgentId, action: AgentAction): Promise<AgentOperationPlan>;
  startOperation(params: CreateTerminalParams & { operationToken: string }): Promise<void>;
  discardPlans(): Promise<void>;
}
