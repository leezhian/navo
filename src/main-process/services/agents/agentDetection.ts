import { realpath } from "node:fs/promises";
import type { AgentAction, AgentInstallation } from "../../../shared/agentTypes";
import type { StoredAgentConfiguration } from "./agentRepository";
import { agentCatalog } from "./agentCatalog";
import { findAgentBinary, isAgentExecutable, runAgentProbe } from "./agentEnvironment";

export interface AgentCommand { command: string; args: string[]; }

export async function agentInstallCommand(id: StoredAgentConfiguration["id"], env: NodeJS.ProcessEnv): Promise<AgentCommand | null> {
  if (process.platform === "win32") return null;
  const npmPackage = agentCatalog[id].npmPackage;
  if (npmPackage) {
    const npm = await findAgentBinary("npm", env);
    return npm ? { command: npm.filename, args: ["install", "-g", npmPackage + "@latest"] } : null;
  }
  if (id === "antigravity") return { command: "/bin/bash", args: ["-c", "set -o pipefail; curl -fsSL https://antigravity.google/cli | bash"] };
  return null;
}

export async function agentUpdateCommand(config: StoredAgentConfiguration, binaryPath: string, env: NodeJS.ProcessEnv): Promise<AgentCommand | null> {
  const actualPath = await realpath(binaryPath);
  const normalized = actualPath.replace(/\\/g, "/");
  // 自定义/应用内捆绑/包管理器安装不能交给其他安装器覆盖。
  if (config.customPath || normalized.includes(".app/") || normalized.includes("/Cellar/") || normalized.includes("/Caskroom/")) return null;
  const definition = agentCatalog[config.id];
  if (definition.npmPackage && normalized.includes("/node_modules/" + definition.npmPackage + "/")) {
    const prefixEnd = normalized.indexOf("/lib/node_modules/");
    const install = await agentInstallCommand(config.id, env);
    return prefixEnd >= 0 && install ? { ...install, args: ["install", "-g", "--prefix", actualPath.slice(0, prefixEnd), definition.npmPackage + "@latest"] } : null;
  }
  return definition.update ? { command: binaryPath, args: definition.update } : null;
}

export async function detectAgentAuth(id: StoredAgentConfiguration["id"], binary: string, env: NodeJS.ProcessEnv): Promise<Pick<AgentInstallation, "auth" | "identity">> {
  if (id === "claude") {
    const result = await runAgentProbe(binary, ["auth", "status", "--json"], env);
    try {
      const value = JSON.parse(result.stdout);
      if ((result.code === 0 || result.code === 1) && typeof value.loggedIn === "boolean") return { auth: value.loggedIn ? "signedIn" : "signedOut", identity: value.loggedIn && typeof value.email === "string" && value.email.length < 255 && /^[^\s@]+@[^\s@]+$/.test(value.email) ? value.email : undefined };
    } catch { /* 旧 CLI 不提供稳定状态接口时保留未知状态。 */ }
  }
  if (id === "codex") {
    const result = await runAgentProbe(binary, ["login", "status"], env);
    const output = result.stdout + "\n" + result.stderr;
    if (result.code === 0 && /^Logged in\b/m.test(output)) return { auth: "signedIn" };
    if (result.code === 1 && /^Not logged in\b/m.test(output)) return { auth: "signedOut" };
  }
  return { auth: "unknown" };
}

export async function detectAgentInstallation(config: StoredAgentConfiguration, env: NodeJS.ProcessEnv): Promise<AgentInstallation> {
  const empty: AgentInstallation = { id: config.id, status: "missing", binaryPath: null, source: null, version: null, auth: "unknown", actions: [] };
  const found = config.customPath ? { filename: config.customPath, source: "custom" as const } : await findAgentBinary(agentCatalog[config.id].binary, env);
  if (!found) return { ...empty, actions: await agentInstallCommand(config.id, env) ? ["install"] : [] };
  if (!await isAgentExecutable(found.filename)) return { ...empty, status: "error", source: found.source, binaryPath: found.filename };
  const result = await runAgentProbe(found.filename, ["--version"], env);
  const version = result.stdout.match(/\b\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?\b/)?.[0];
  if (result.code !== 0 || !version) return { ...empty, status: "error", source: found.source, binaryPath: found.filename };
  const actions: AgentAction[] = agentCatalog[config.id].login ? ["login", "logout"] : ["manageLogin"];
  if (await agentUpdateCommand(config, found.filename, env)) actions.push("update");
  return { id: config.id, status: "installed", binaryPath: found.filename, version, source: found.source, auth: "unknown", actions };
}

export async function detectAgent(config: StoredAgentConfiguration, env: NodeJS.ProcessEnv): Promise<AgentInstallation> {
  const installation = await detectAgentInstallation(config, env);
  if (installation.status !== "installed" || !installation.binaryPath) return installation;
  return { ...installation, ...await detectAgentAuth(config.id, installation.binaryPath, env) };
}
