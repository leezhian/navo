import type { AgentId, AgentInstallation, AgentSettingsSnapshot } from "./agentTypes";

export interface AgentCapabilityEntry {
  /** 最后成功的真实能力；后台失败或刷新中仍保留用于展示。 */
  capabilities: AgentCapabilities | null;
  /** 首次无缓存或运行环境已变化时，等待后台刷新后才允许提交。 */
  pending: boolean;
  error: string | null;
}

export interface AgentCapabilitySnapshot {
  settings: AgentSettingsSnapshot;
  installations: AgentInstallation[];
  entries: Partial<Record<AgentId, AgentCapabilityEntry>>;
}

export interface AgentModelOption {
  id: string;
  name: string;
  efforts: string[];
  /** null 表示沿用 CLI 默认值，不猜测默认思考等级。 */
  defaultEffort: string | null;
  supportsAutoMode?: boolean;
}

export interface AgentModeOption {
  id: string;
  name: string;
}

export interface AgentCapabilities {
  agentId: AgentId;
  models: AgentModelOption[];
  modes: AgentModeOption[];
  defaultModelId: string;
  defaultModeId: string;
}

/** 任务级配置快照；不会修改 CLI 全局设置，也不代表已经启动会话。 */
export interface TaskAgentSelection {
  agentId: AgentId;
  modelId: string;
  modelName: string;
  modeId: string;
  modeName: string;
  effort: string | null;
}
