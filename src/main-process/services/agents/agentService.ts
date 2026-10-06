import { randomUUID } from "node:crypto";
import os from "node:os";
import type { WebContents } from "electron";
import type { AgentAction, AgentId, AgentInstallation, AgentOperationPlan, SaveAgentConfiguration } from "../../../shared/agentTypes";
import type { CreateTerminalParams } from "../../../shared/terminalTypes";
import { AgentRepository, requireAgentId } from "./agentRepository";
import { agentShellEnvironment, isAgentExecutable } from "./agentEnvironment";
import { agentCatalog } from "./agentCatalog";
import { agentInstallCommand, agentUpdateCommand, detectAgent } from "./agentDetection";
import { createTerminal } from "../terminal/terminalService";

const PLAN_LIFETIME_MS = 10 * 60 * 1000;
type PreparedCommand = AgentOperationPlan & { ownerId: number; expiresAt: number; commandPath: string; args: string[]; env: NodeJS.ProcessEnv };

export class AgentService {
  readonly repository: AgentRepository;
  private readonly plans = new Map<string, PreparedCommand>();
  private running = false;

  constructor(filename: string) { this.repository = new AgentRepository(filename); }

  async scan(): Promise<AgentInstallation[]> {
    const [{ configurations }, env] = await Promise.all([this.repository.read(), agentShellEnvironment()]);
    return Promise.all(configurations.map(async (config) => {
      try { return await detectAgent(config, { ...env, ...this.repository.environment(config) }); }
      catch { return { id: config.id, status: "error", binaryPath: null, version: null, source: null, auth: "unknown", actions: [] }; }
    }));
  }

  async save(input: SaveAgentConfiguration) {
    if (this.running) throw new Error("AGENT_BUSY");
    if (typeof input?.customPath === "string" && input.customPath.trim() && !await isAgentExecutable(input.customPath.trim())) throw new Error("AGENT_INVALID_PATH");
    const result = await this.repository.save(input);
    for (const [token, plan] of this.plans) if (plan.id === input.id) this.plans.delete(token);
    return result;
  }

  async setDefault(id: AgentId | null) {
    if (id !== null) {
      requireAgentId(id);
      const configuration = (await this.repository.read()).configurations.find((config) => config.id === id);
      const installation = (await this.scan()).find((item) => item.id === id);
      if (!configuration?.enabled || installation?.status !== "installed") throw new Error("AGENT_UNAVAILABLE");
    }
    return this.repository.setDefault(id);
  }

  discardPlans(ownerId: number) {
    for (const [token, plan] of this.plans) if (plan.ownerId === ownerId) this.plans.delete(token);
  }

  async prepare(id: AgentId, action: AgentAction, ownerId: number): Promise<AgentOperationPlan> {
    requireAgentId(id);
    if (this.running) throw new Error("AGENT_BUSY");
    const [{ configurations }, env] = await Promise.all([this.repository.read(), agentShellEnvironment()]);
    const config = configurations.find((item) => item.id === id);
    if (!config) throw new Error("AGENT_INVALID");
    const runtimeEnv = { ...env, ...this.repository.environment(config) };
    const installation = await detectAgent(config, runtimeEnv);
    if (!installation.actions.includes(action)) throw new Error("AGENT_UNAVAILABLE");
    const definition = agentCatalog[id];
    const command = action === "install" ? await agentInstallCommand(id, env)
      : action === "update" && installation.binaryPath ? await agentUpdateCommand(config, installation.binaryPath, env)
      : installation.binaryPath ? { command: installation.binaryPath, args: action === "login" ? definition.login ?? [] : action === "logout" ? definition.logout ?? [] : config.args } : null;
    if (!command) throw new Error("AGENT_UNAVAILABLE");
    for (const [token, plan] of this.plans) if (plan.expiresAt < Date.now() || (plan.ownerId === ownerId && plan.id === id)) this.plans.delete(token);
    if (this.plans.size >= 32) throw new Error("AGENT_BUSY");
    const plan: PreparedCommand = {
      token: randomUUID(), id, action, ownerId, expiresAt: Date.now() + PLAN_LIFETIME_MS,
      command: [command.command, ...command.args].map((part) => JSON.stringify(part)).join(" "),
      commandPath: command.command, args: command.args, env: action === "install" || action === "update" ? env : runtimeEnv,
    };
    this.plans.set(plan.token, plan);
    return { token: plan.token, id, action, command: plan.command };
  }

  start(params: CreateTerminalParams & { operationToken: string }, owner: WebContents) {
    if (!params || typeof params.operationToken !== "string" || params.sessionId !== "agent-" + params.operationToken) throw new Error("AGENT_INVALID");
    const plan = this.plans.get(params.operationToken);
    if (!plan || plan.ownerId !== owner.id || plan.expiresAt < Date.now()) throw new Error("AGENT_EXPIRED_PLAN");
    if (this.running) throw new Error("AGENT_BUSY");
    this.plans.delete(plan.token);
    this.running = true;
    try {
      createTerminal({ ...params, cwd: os.homedir() }, owner, {
        command: plan.commandPath, args: plan.args, env: plan.env,
        onFinish: () => { this.running = false; },
      });
    } catch { this.running = false; throw new Error("AGENT_START_FAILED"); }
  }
}
