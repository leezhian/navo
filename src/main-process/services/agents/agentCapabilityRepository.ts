import type { AgentCapabilities } from "../../../shared/agentCapabilities";
import type { AgentId, AgentInstallation } from "../../../shared/agentTypes";
import { openAppDatabase } from "../appDatabase";

export interface CachedAgentCapabilities {
  agentId: AgentId;
  binaryPath: string;
  fingerprint: string;
  capabilities: AgentCapabilities;
  updatedAt: number;
}

export interface AgentCapabilityState {
  installation: AgentInstallation;
  configurationKey: string;
  fingerprint: string | null;
  invalidated: boolean;
  error: string | null;
}

/** 独立保存最后成功结果与当前检测状态，失败不会覆盖模型缓存。 */
export class AgentCapabilityRepository {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly filename: string) {}

  async read() {
    await this.queue;
    const database = await openAppDatabase(this.filename);
    try {
      return {
        records: database.prepare("SELECT data FROM agent_capability_cache").all().map((row) => JSON.parse(String(row.data)) as CachedAgentCapabilities),
        states: database.prepare("SELECT data FROM agent_capability_state").all().map((row) => JSON.parse(String(row.data)) as AgentCapabilityState),
      };
    } finally { database.close(); }
  }

  save(state: AgentCapabilityState, record: CachedAgentCapabilities | null, current: () => boolean) {
    const result = this.queue.then(async () => {
      const database = await openAppDatabase(this.filename);
      try {
        if (!current()) return;
        database.exec("BEGIN IMMEDIATE");
        try {
          // 缓存仅需账号指纹，不将邮箱、凭证或原始 CLI 输出复制到数据库。
          const installation = { ...state.installation, identity: undefined };
          database.prepare("INSERT INTO agent_capability_state VALUES (?,?) ON CONFLICT(agent_id) DO UPDATE SET data=excluded.data")
            .run(installation.id, JSON.stringify({ ...state, installation }));
          if (record) database.prepare("INSERT INTO agent_capability_cache VALUES (?,?,?) ON CONFLICT(agent_id,binary_path) DO UPDATE SET data=excluded.data")
            .run(record.agentId, record.binaryPath, JSON.stringify(record));
          database.exec("COMMIT");
        } catch (error) { database.exec("ROLLBACK"); throw error; }
      } finally { database.close(); }
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  async flush() { await this.queue; }
}
