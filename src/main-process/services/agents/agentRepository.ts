import { safeStorage } from "electron";
import { AGENT_IDS } from "../../../shared/agentTypes";
import type { AgentId, AgentSettingsSnapshot, SaveAgentConfiguration } from "../../../shared/agentTypes";
import { openAppDatabase } from "../appDatabase";

export interface StoredAgentConfiguration {
  id: AgentId;
  enabled: boolean;
  customPath: string;
  args: string[];
  environment: Record<string, string>;
}

export function secureAgentStorageAvailable() {
  return safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== "basic_text";
}

export function requireAgentId(value: unknown): asserts value is AgentId {
  if (!AGENT_IDS.includes(value as AgentId)) throw new Error("AGENT_INVALID");
}

function validateConfiguration(input: SaveAgentConfiguration) {
  if (!input || typeof input !== "object") throw new Error("AGENT_INVALID");
  requireAgentId(input.id);
  if (typeof input.enabled !== "boolean" || typeof input.customPath !== "string" || input.customPath.length > 4096 || input.customPath.includes("\0")
    || !Array.isArray(input.args) || input.args.length > 100 || input.args.some((arg) => typeof arg !== "string" || arg.length > 8192 || arg.includes("\0"))
    || !Array.isArray(input.environment) || input.environment.length > 100
    || input.environment.some((entry) => !entry || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(entry.name) || (entry.value !== undefined && (typeof entry.value !== "string" || entry.value.length > 16384 || entry.value.includes("\0"))))
    || new Set(input.environment.map((entry) => entry.name.toUpperCase())).size !== input.environment.length) throw new Error("AGENT_INVALID");
}

export class AgentRepository {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly filename: string) {}

  async read(): Promise<{ defaultAgent: AgentId | null; configurations: StoredAgentConfiguration[] }> {
    await this.queue;
    const database = await openAppDatabase(this.filename);
    try {
      const rows = database.prepare("SELECT id,data FROM agent_configurations").all();
      const configurations = AGENT_IDS.map((id) => {
        const row = rows.find((item) => item.id === id);
        if (!row) return { id, enabled: true, customPath: "", args: [], environment: {} };
        const value = JSON.parse(String(row.data)) as StoredAgentConfiguration;
        if (!value || !value.environment || typeof value.environment !== "object" || Array.isArray(value.environment)) throw new Error("AGENT_INVALID");
        validateConfiguration({ ...value, environment: Object.keys(value.environment).map((name) => ({ name })) });
        if (value.id !== id || Object.values(value.environment).some((encrypted) => typeof encrypted !== "string")) throw new Error("AGENT_INVALID");
        return value;
      });
      const row = database.prepare("SELECT value FROM agent_preferences WHERE key='defaultAgent'").get();
      const defaultAgent = row ? JSON.parse(String(row.value)) as AgentId | null : null;
      if (defaultAgent !== null) requireAgentId(defaultAgent);
      return { configurations, defaultAgent };
    } catch { throw new Error("AGENT_STORAGE_FAILED"); }
    finally { database.close(); }
  }

  async snapshot(): Promise<AgentSettingsSnapshot> {
    const stored = await this.read();
    return { defaultAgent: stored.defaultAgent, secureStorageAvailable: secureAgentStorageAvailable(), configurations: stored.configurations.map(({ environment, ...config }) => ({ ...config, environmentNames: Object.keys(environment) })) };
  }

  environment(config: StoredAgentConfiguration): Record<string, string> {
    if (!Object.keys(config.environment).length) return {};
    if (!secureAgentStorageAvailable()) throw new Error("AGENT_SECURE_STORAGE");
    try { return Object.fromEntries(Object.entries(config.environment).map(([name, value]) => [name, safeStorage.decryptString(Buffer.from(value, "base64"))])); }
    catch { throw new Error("AGENT_SECURE_STORAGE"); }
  }

  async save(input: SaveAgentConfiguration) {
    validateConfiguration(input);
    await this.serialize(async () => {
      const database = await openAppDatabase(this.filename);
      try {
        const row = database.prepare("SELECT data FROM agent_configurations WHERE id=?").get(input.id);
        const previous = row ? JSON.parse(String(row.data)) as StoredAgentConfiguration : undefined;
        const environment: Record<string, string> = Object.create(null);
        for (const entry of input.environment) {
          if (entry.value === undefined && previous?.environment[entry.name] !== undefined) environment[entry.name] = previous.environment[entry.name];
          else {
            if (!secureAgentStorageAvailable()) throw new Error("AGENT_SECURE_STORAGE");
            environment[entry.name] = safeStorage.encryptString(entry.value ?? "").toString("base64");
          }
        }
        const config: StoredAgentConfiguration = { id: input.id, enabled: input.enabled, customPath: input.customPath.trim(), args: input.args, environment };
        database.prepare("INSERT INTO agent_configurations VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(input.id, JSON.stringify(config));
      } finally { database.close(); }
    });
    return this.snapshot();
  }

  async setDefault(id: AgentId | null) {
    if (id !== null) requireAgentId(id);
    await this.serialize(async () => {
      const database = await openAppDatabase(this.filename);
      try { database.prepare("INSERT INTO agent_preferences VALUES ('defaultAgent',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(id)); }
      finally { database.close(); }
    });
    return this.snapshot();
  }

  async flush() { await this.queue; }
  private serialize<Result>(run: () => Promise<Result>) {
    const result = this.queue.then(run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
