import { AGENT_IDS } from "../shared/agentTypes";
import type { AgentCapabilities, TaskAgentSelection } from "../shared/agentCapabilities";

export function isTaskAgentSelection(value: unknown): value is TaskAgentSelection {
  if (!value || typeof value !== "object") return false;
  const selection = value as TaskAgentSelection;
  const validText = (text: unknown) => typeof text === "string" && text.length > 0 && text.length <= 256 && Array.from(text).every((char) => char.charCodeAt(0) >= 32);
  return AGENT_IDS.includes(selection.agentId) && [selection.modelId, selection.modelName, selection.modeId, selection.modeName].every(validText)
    && (selection.effort === null || validText(selection.effort));
}

export function availableAgentModes(capabilities: AgentCapabilities, modelId: string) {
  const model = capabilities.models.find((item) => item.id === modelId);
  return capabilities.modes.filter((mode) => !(capabilities.agentId === "claude" && mode.id === "auto" && !model?.supportsAutoMode));
}

export function defaultAgentSelection(capabilities: AgentCapabilities, modelId = capabilities.defaultModelId): TaskAgentSelection {
  const model = capabilities.models.find((item) => item.id === modelId) ?? capabilities.models[0];
  const modes = availableAgentModes(capabilities, model.id);
  const mode = modes.find((item) => item.id === capabilities.defaultModeId) ?? modes[0];
  return { agentId: capabilities.agentId, modelId: model.id, modelName: model.name, modeId: mode.id, modeName: mode.name, effort: model.defaultEffort };
}

export function matchesAgentCapabilities(selection: TaskAgentSelection, capabilities: AgentCapabilities) {
  const model = capabilities.models.find((item) => item.id === selection.modelId);
  return selection.agentId === capabilities.agentId && Boolean(model)
    && availableAgentModes(capabilities, selection.modelId).some((mode) => mode.id === selection.modeId)
    && (selection.effort === null || Boolean(model?.efforts.includes(selection.effort)));
}
