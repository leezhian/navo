import type { AgentId, AgentsApi } from "@/shared/agentTypes";

export function getAgentsApi(): AgentsApi {
  if (!window.navo?.agents) throw new Error("DESKTOP_REQUIRED");
  return window.navo.agents;
}

export async function readAgentCapabilitySnapshot() {
  const api = getAgentsApi();
  if (typeof api.capabilitySnapshot !== "function") throw new Error("AGENT_RUNTIME_OUTDATED");
  try { return await api.capabilitySnapshot(); }
  catch (error) {
    if (String(error).includes("No handler registered")) throw new Error("AGENT_RUNTIME_OUTDATED");
    throw error;
  }
}

export async function readTaskAgentCapabilities(id: AgentId) {
  const api = getAgentsApi();
  if (typeof api.capabilities !== "function") throw new Error("AGENT_RUNTIME_OUTDATED");
  try { return await api.capabilities(id); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("No handler registered") && message.includes("agents:capabilities")) throw new Error("AGENT_RUNTIME_OUTDATED");
    throw error;
  }
}
