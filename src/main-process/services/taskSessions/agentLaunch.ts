import type { TaskAgentSelection } from "../../../shared/agentCapabilities";
import { AgentService } from "../agents/agentService";
import { agentShellEnvironment, runAgentProbe } from "../agents/agentEnvironment";
import { detectAgent } from "../agents/agentDetection";
import { matchesAgentCapabilities } from "../../../utils/taskAgentSelection";
import { agentLaunchArguments } from "./launchArguments";
import { CONTEXT_INSTRUCTIONS, contextLaunchArguments, supportsSessionContext } from "./contextLaunchArguments";
import type { TaskContextConnection } from "./taskContextServer";
import { nativeLaunchReference } from "./nativeSessionBinding";
import { helpOffersAddDir } from "./antigravityWorkspacePlugin";
import type { WorkspaceMcpAttachment } from "./sessionWorkspaceMcp";

export async function prepareAgentLaunch(agents: AgentService, selection: TaskAgentSelection, nativeId: string, prompt: string, resume: boolean, nativeHistoryRoot?: string, connectContext?: () => Promise<TaskContextConnection>, dynamicPrompt?: string, prepareContextFile?: () => Promise<string>, nativeLaunchId?: string, attachWorkspace?: () => Promise<WorkspaceMcpAttachment | undefined>) {
  const { configurations } = await agents.repository.read();
  const config = configurations.find((item) => item.id === selection.agentId);
  if (!config?.enabled) throw new Error("AGENT_UNAVAILABLE");
  const env = { ...await agentShellEnvironment(), ...agents.repository.environment(config) };
  if (resume && nativeHistoryRoot && selection.agentId === "grok") env.GROK_HOME = nativeHistoryRoot;
  if (resume && nativeHistoryRoot && selection.agentId === "claude") env.CLAUDE_CONFIG_DIR = nativeHistoryRoot;
  if (resume && nativeHistoryRoot && selection.agentId === "codex") env.CODEX_HOME = nativeHistoryRoot;
  const installation = await detectAgent(config, env);
  if (!installation.binaryPath || installation.status === "missing" || installation.auth === "signedOut") throw new Error("AGENT_UNAVAILABLE");
  const capabilities = await agents.capabilities(selection.agentId);
  if (!matchesAgentCapabilities(selection, capabilities)) throw new Error("AGENT_UNAVAILABLE");
  const help = await runAgentProbe(installation.binaryPath, ["--help"], env);
  if (help.code !== 0) throw new Error("AGENT_UNAVAILABLE");
  let helpText = `${help.stdout}\n${help.stderr}`;
  if (resume && selection.agentId === "codex") {
    const resumeHelp = await runAgentProbe(installation.binaryPath, ["resume", "--help"], env);
    if (resumeHelp.code !== 0) throw new Error("SESSION_RESUME_UNSUPPORTED");
    helpText += `\n${resumeHelp.stdout}\n${resumeHelp.stderr}`;
  }
  if (!resume && nativeLaunchId) {
    const reference = "\n\n" + nativeLaunchReference(nativeLaunchId);
    prompt += reference;
    if (dynamicPrompt !== undefined) dynamicPrompt += reference;
  }
  const context = await resolveDynamicContext(selection.agentId, helpText, connectContext, attachWorkspace);
  const canPassFileInstructions = !resume || (selection.agentId === "grok" && helpText.includes("--rules"));
  const fileInstructions = !context && prepareContextFile && canPassFileInstructions ? await prepareContextFile() : undefined;
  const fileArgs = fileInstructions && selection.agentId === "grok" && helpText.includes("--rules") ? ["--rules", fileInstructions] : [];
  if (context) { Object.assign(env, context.env); prompt = (dynamicPrompt ?? prompt) + "\n\n" + CONTEXT_INSTRUCTIONS; }
  else if (fileInstructions) prompt = (dynamicPrompt ?? prompt) + "\n\n" + fileInstructions;
  return { command: installation.binaryPath, env,
    contextMode: context ? "dynamic" as const : fileInstructions ? "file" as const : "snapshot" as const,
    args: [...config.args, ...(context?.args ?? []), ...fileArgs, ...agentLaunchArguments(selection, nativeId, prompt, resume, helpText)] };
}

/** Grok/Antigravity 的配置写入失败时退回文件，不把动态模式标成已连接。 */
async function resolveDynamicContext(agent: TaskAgentSelection["agentId"], helpText: string, connectContext?: () => Promise<TaskContextConnection>, attachWorkspace?: () => Promise<WorkspaceMcpAttachment | undefined>) {
  if (!supportsSessionContext(agent, helpText)) return undefined;
  if (agent === "grok" || agent === "antigravity") {
    if (!attachWorkspace) return undefined;
    // Antigravity 要能把私有插件目录加进本次进程。帮助里没有这个参数就保持文件模式。
    if (agent === "antigravity" && !helpOffersAddDir(helpText)) return undefined;
    try {
      const attached = await attachWorkspace();
      return attached ? { args: attached.args ?? [], env: attached.env } : undefined;
    } catch { return undefined; }
  }
  return connectContext ? contextLaunchArguments(agent, await connectContext(), helpText) : undefined;
}
