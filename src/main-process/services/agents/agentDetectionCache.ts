import type { AgentId, AgentInstallation } from "../../../shared/agentTypes";
import type { StoredAgentConfiguration } from "./agentRepository";
import { agentConfigurationKey } from "./agentCapabilityFingerprint";
import { detectAgentAuth, detectAgentInstallation } from "./agentDetection";

export const AGENT_AUTH_CACHE_TTL_MS = 5000;
export type AgentDetectionScope = "all" | "auth";
type AuthStatus = Pick<AgentInstallation, "auth" | "identity">;

/** 安装结果保留到主动失效；登录状态短期复用。失效后旧请求不能覆盖新缓存。 */
export class AgentDetectionCache {
  private installations = new Map<AgentId, { key: string; result: Promise<AgentInstallation> }>();
  private authentications = new Map<AgentId, { key: string; result: Promise<AuthStatus>; checkedAt: number | null }>();

  invalidate(id: AgentId, scope: AgentDetectionScope = "all") {
    if (scope === "all") this.installations.delete(id);
    this.authentications.delete(id);
  }

  async read(config: StoredAgentConfiguration, env: NodeJS.ProcessEnv): Promise<AgentInstallation> {
    const key = agentConfigurationKey(config);
    let cached = this.installations.get(config.id);
    if (!cached || cached.key !== key) {
      const entry = { key, result: detectAgentInstallation(config, env) };
      this.installations.set(config.id, entry);
      entry.result = entry.result.then((result) => {
        if (result.status === "error" && this.installations.get(config.id) === entry) this.installations.delete(config.id);
        return result;
      }).catch((error) => {
        if (this.installations.get(config.id) === entry) this.installations.delete(config.id);
        throw error;
      });
      cached = entry;
    }
    const installation = await cached.result;
    if (installation.status !== "installed" || !installation.binaryPath) return installation;
    // 该安装查询已被替换时，不再以旧路径启动账号查询。
    if (this.installations.get(config.id) !== cached) return installation;
    const authKey = JSON.stringify([key, installation.binaryPath, installation.version]);
    let auth = this.authentications.get(config.id);
    const age = auth?.checkedAt == null ? null : Date.now() - auth.checkedAt;
    if (!auth || auth.key !== authKey || (age !== null && (age < 0 || age >= AGENT_AUTH_CACHE_TTL_MS))) {
      const entry = { key: authKey, checkedAt: null as number | null, result: detectAgentAuth(config.id, installation.binaryPath, env) };
      this.authentications.set(config.id, entry);
      entry.result = entry.result.then((result) => { entry.checkedAt = Date.now(); return result; }).catch((error) => {
        if (this.authentications.get(config.id) === entry) this.authentications.delete(config.id);
        throw error;
      });
      auth = entry;
    }
    return { ...installation, ...await auth.result };
  }
}
