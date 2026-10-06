import type { AgentsApi } from "@/shared/agentTypes";

export function getAgentsApi(): AgentsApi {
  if (!window.navo?.agents) throw new Error("DESKTOP_REQUIRED");
  return window.navo.agents;
}
