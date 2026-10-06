import type { AgentId } from "../../../shared/agentTypes";

export const agentCatalog: Record<AgentId, { binary: string; documentation: string; npmPackage?: string; login?: string[]; logout?: string[]; update?: string[] }> = {
  claude: { binary: "claude", documentation: "https://code.claude.com/docs/en/setup", npmPackage: "@anthropic-ai/claude-code", login: ["auth", "login"], logout: ["auth", "logout"], update: ["update"] },
  codex: { binary: "codex", documentation: "https://developers.openai.com/codex/cli", npmPackage: "@openai/codex", login: ["login"], logout: ["logout"] },
  grok: { binary: "grok", documentation: "https://x.ai/cli", login: ["login"], logout: ["logout"], update: ["update"] },
  antigravity: { binary: "agy", documentation: "https://antigravity.google/", update: ["update"] },
};
