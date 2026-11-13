import type { AgentConfiguration, AgentId, AgentInstallation } from "../shared/agentTypes";

export const agentNames: Record<AgentId, string> = {
  claude: "Claude Code", codex: "Codex", grok: "Grok Build", antigravity: "Antigravity",
};

/** 未知或探测失败不等于不可用；仅排除明确缺失、未登录及用户禁用的配置。 */
export function canSelectTaskAgent(config: Pick<AgentConfiguration, "enabled">, installation?: Pick<AgentInstallation, "status" | "auth">) {
  return config.enabled && installation?.status !== "missing" && installation?.auth !== "signedOut";
}
