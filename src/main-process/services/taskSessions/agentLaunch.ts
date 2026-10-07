import type { TaskAgentSelection } from "../../../shared/agentCapabilities";
import { AgentService } from "../agents/agentService";
import { agentShellEnvironment, runAgentProbe } from "../agents/agentEnvironment";
import { detectAgent } from "../agents/agentDetection";
import { matchesAgentCapabilities } from "../../../utils/taskAgentSelection";
import { agentLaunchArguments } from "./launchArguments";

export async function prepareAgentLaunch(agents: AgentService, selection: TaskAgentSelection, nativeId: string, prompt: string, resume: boolean, nativeHistoryRoot?: string) {
  const { configurations } = await agents.repository.read();
  const config = configurations.find((item) => item.id === selection.agentId);
  if (!config?.enabled) throw new Error("AGENT_UNAVAILABLE");
  const env = { ...await agentShellEnvironment(), ...agents.repository.environment(config) };
  if (resume && nativeHistoryRoot && selection.agentId === "grok") env.GROK_HOME = nativeHistoryRoot;
  if (resume && nativeHistoryRoot && selection.agentId === "claude") env.CLAUDE_CONFIG_DIR = nativeHistoryRoot;
  const installation = await detectAgent(config, env);
  if (!installation.binaryPath || installation.status === "missing" || installation.auth === "signedOut") throw new Error("AGENT_UNAVAILABLE");
  const capabilities = await agents.capabilities(selection.agentId);
  if (!matchesAgentCapabilities(selection, capabilities)) throw new Error("AGENT_UNAVAILABLE");
  const help = await runAgentProbe(installation.binaryPath, ["--help"], env);
  if (help.code !== 0) throw new Error("AGENT_UNAVAILABLE");
  return { command: installation.binaryPath, env,
    args: [...config.args, ...agentLaunchArguments(selection, nativeId, prompt, resume, `${help.stdout}\n${help.stderr}`)] };
}
