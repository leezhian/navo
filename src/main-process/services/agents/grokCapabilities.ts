import type { AgentCapabilities, AgentModelOption } from "../../../shared/agentCapabilities";
import { cliOptionHelp, label, list, object, orderedEfforts, requireCapabilities, unique } from "./agentCapabilityData";
import { runAgentProbe } from "./agentEnvironment";
import { openAgentProtocol } from "./agentProtocolClient";

export function parseGrokCapabilities(response: unknown, help: string): AgentCapabilities {
  const state = object(object(object(response)._meta).modelState);
  const models = unique(list(state.availableModels).map((entry): AgentModelOption => {
    const model = object(entry);
    const metadata = object(model._meta);
    const options = metadata.supportsReasoningEffort === true ? list(metadata.reasoningEfforts).map(object) : [];
    const efforts = orderedEfforts(options.map((option) => label(option.value) || label(option.id)));
    const recommended = options.find((option) => option.default === true);
    const defaultEffort = label(metadata.reasoningEffort) || label(recommended?.value) || label(recommended?.id);
    return { id: label(model.modelId), name: label(model.name) || label(model.modelId), efforts, defaultEffort: efforts.includes(defaultEffort) ? defaultEffort : null };
  }));
  const choices = cliOptionHelp(help, "--permission-mode").match(/\[possible values:\s*([^\]]+)\]/)?.[1] ?? "";
  const modes = unique(choices.split(",").map((value) => ({ id: label(value.trim()), name: label(value.trim()) })));
  const currentModelId = label(state.currentModelId);
  return requireCapabilities({ agentId: "grok", models, modes,
    defaultModelId: models.some((model) => model.id === currentModelId) ? currentModelId : models[0]?.id ?? "",
    defaultModeId: modes.find((mode) => mode.id === "default")?.id ?? modes[0]?.id ?? "" });
}

export async function readGrokCapabilities(binary: string, env: NodeJS.ProcessEnv) {
  const help = await runAgentProbe(binary, ["--help"], env);
  if (help.code !== 0) throw new Error("AGENT_CAPABILITIES_FAILED");
  // 初始化响应已含模型级能力；不复用用户 leader，不创建会话或发送 prompt。
  const client = openAgentProtocol(binary, ["agent", "--no-leader", "stdio"], env);
  try {
    const response = await client.request(1, { jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: "navo", version: "1.0.0" } } });
    return parseGrokCapabilities(response, `${help.stdout}\n${help.stderr}`);
  } finally { client.close(); }
}
