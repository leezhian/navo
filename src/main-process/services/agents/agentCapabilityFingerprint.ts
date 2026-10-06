import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentInstallation } from "../../../shared/agentTypes";
import type { StoredAgentConfiguration } from "./agentRepository";

function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export function agentConfigurationKey(config: StoredAgentConfiguration) {
  return digest([config.enabled, config.customPath, config.args, Object.entries(config.environment).sort()]);
}

/** 只读取凭证文件元数据，不读取 token；文件变更只用于失效，不推断登录状态。 */
export async function agentCapabilityFingerprint(config: StoredAgentConfiguration, installation: AgentInstallation, env: NodeJS.ProcessEnv) {
  const home = env.HOME || env.USERPROFILE || os.homedir();
  const files: Record<StoredAgentConfiguration["id"], string[]> = {
    claude: [path.join(env.CLAUDE_CONFIG_DIR || path.join(home, ".claude"), ".credentials.json")],
    codex: [path.join(env.CODEX_HOME || path.join(home, ".codex"), "auth.json")],
    grok: [env.GROK_AUTH_PATH || path.join(env.GROK_HOME || path.join(home, ".grok"), "auth.json")],
    antigravity: [],
  };
  const metadata = await Promise.all(files[config.id].map(async (filename) => {
    try { const value = await stat(filename); return [filename, value.ino, value.size, value.mtimeMs, value.ctimeMs]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return [filename, null]; throw error; }
  }));
  const authVariables = Object.entries(env).filter(([name]) => /^(ANTHROPIC_|CLAUDE_CODE_OAUTH_TOKEN$|OPENAI_|CODEX_HOME$|XAI_|GROK_|GOOGLE_API_KEY$|GEMINI_API_KEY$|CLAUDE_CONFIG_DIR$)/.test(name)).sort();
  return digest([agentConfigurationKey(config), installation.binaryPath, installation.version, installation.auth, installation.identity ?? null, metadata, authVariables]);
}
