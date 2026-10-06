import type { AgentCapabilities, AgentModelOption, AgentModeOption } from "../../../shared/agentCapabilities";
import type { AgentId } from "../../../shared/agentTypes";
import { runAgentProbe } from "./agentEnvironment";
import { openAgentProtocol } from "./agentProtocolClient";
import { object, list, label, unique, requireCapabilities } from "./agentCapabilityData";
import { readGrokCapabilities } from "./grokCapabilities";
import { readAntigravityCapabilities } from "./antigravityCapabilities";

export function parseClaudeCapabilities(value: unknown, help: string): AgentCapabilities {
  const response = object(value);
  const models = unique(list(response.models).map((entry): AgentModelOption => {
    const model = object(entry);
    return { id: label(model.value), name: label(model.resolvedModel) || label(model.displayName) || label(model.value),
      efforts: model.supportsEffort === true ? list(model.supportedEffortLevels).map(label).filter(Boolean) : [], defaultEffort: null,
      supportsAutoMode: model.supportsAutoMode === true };
  }));
  const permissionChoices = help.match(/--permission-mode\b[\s\S]*?\(choices:([^)]*)\)/)?.[1] ?? "";
  const modes = unique([...permissionChoices.matchAll(/"([^"]+)"/g)].map((match) => ({ id: match[1], name: match[1] })));
  const currentMode = label(response.current_permission_mode);
  return requireCapabilities({ agentId: "claude", models, modes, defaultModelId: models.find((model) => model.id === "default")?.id ?? models[0]?.id ?? "",
    defaultModeId: modes.find((mode) => mode.id === currentMode)?.id ?? modes.find((mode) => ["default", "manual"].includes(mode.id))?.id ?? modes[0]?.id ?? "" });
}

export function parseCodexCapabilities(modelRows: unknown[], modeRows: unknown[]): AgentCapabilities {
  const visible = modelRows.map(object).filter((model) => model.hidden !== true);
  const models = unique(visible.map((model): AgentModelOption => {
    const efforts = list(model.supportedReasoningEfforts).map((entry) => label(object(entry).reasoningEffort)).filter(Boolean);
    const defaultEffort = label(model.defaultReasoningEffort);
    return { id: label(model.model) || label(model.id), name: label(model.displayName) || label(model.model) || label(model.id), efforts, defaultEffort: efforts.includes(defaultEffort) ? defaultEffort : null };
  }));
  const modes: AgentModeOption[] = unique(modeRows.map((entry) => { const mode = object(entry); return { id: label(mode.mode), name: label(mode.name) || label(mode.mode) }; }));
  const defaultModel = visible.find((model) => model.isDefault === true);
  return requireCapabilities({ agentId: "codex", models, modes, defaultModelId: label(defaultModel?.model) || label(defaultModel?.id) || models[0]?.id || "",
    defaultModeId: modes.find((mode) => mode.id === "default")?.id ?? modes[0]?.id ?? "" });
}

export async function readAgentCapabilities(id: AgentId, binary: string, env: NodeJS.ProcessEnv): Promise<AgentCapabilities> {
  if (id === "claude") {
    const help = await runAgentProbe(binary, ["--help"], env);
    if (help.code !== 0) throw new Error("AGENT_CAPABILITIES_FAILED");
    // 跳过项目、hooks 和 MCP，保留用户认证与模型别名；不创建可恢复的任务会话。
    const client = openAgentProtocol(binary, ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
      "--no-session-persistence", "--setting-sources", "user", "--settings", '{"disableAllHooks":true}', "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--tools", ""], env);
    try {
      const response = await client.request("capabilities", { type: "control_request", request_id: "capabilities", request: { subtype: "initialize" } });
      return parseClaudeCapabilities(response, help.stdout);
    } finally { client.close(); }
  }
  if (id === "codex") {
    const client = openAgentProtocol(binary, ["app-server"], env);
    try {
      await client.request(1, { id: 1, method: "initialize", params: { clientInfo: { name: "navo", version: "1.0.0" }, capabilities: { experimentalApi: true } } });
      client.send({ method: "initialized" });
      const rows: unknown[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 10; page += 1) {
        const response = object(await client.request(page + 2, { id: page + 2, method: "model/list", params: { limit: 100, cursor } }));
        rows.push(...list(response.data));
        cursor = label(response.nextCursor) || null;
        if (!cursor) break;
      }
      if (cursor) throw new Error("AGENT_CAPABILITIES_FAILED");
      const modes = object(await client.request(20, { id: 20, method: "collaborationMode/list", params: {} }));
      return parseCodexCapabilities(rows, list(modes.data));
    } finally { client.close(); }
  }
  if (id === "grok") return readGrokCapabilities(binary, env);
  if (id === "antigravity") return readAntigravityCapabilities(binary, env);
  throw new Error("AGENT_INVALID");
}
