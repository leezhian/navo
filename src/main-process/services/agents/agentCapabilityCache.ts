import { AGENT_IDS } from "../../../shared/agentTypes";
import type { AgentId, AgentInstallation } from "../../../shared/agentTypes";
import type { AgentCapabilitySnapshot } from "../../../shared/agentCapabilities";
import { canSelectTaskAgent } from "../../../domain/agents";
import { AgentRepository } from "./agentRepository";
import { AgentCapabilityRepository } from "./agentCapabilityRepository";
import type { AgentCapabilityState, CachedAgentCapabilities } from "./agentCapabilityRepository";
import { agentCapabilityFingerprint, agentConfigurationKey } from "./agentCapabilityFingerprint";
import { agentShellEnvironment } from "./agentEnvironment";
import { detectAgent } from "./agentDetection";
import { readAgentCapabilities } from "./agentCapabilities";

export const AGENT_CACHE_MAX_AGE_MS = 4 * 60 * 60 * 1000;
export const AGENT_CACHE_START_DELAY_MS = 30000;

/** 所有 CLI 检测集中在刷新入口；snapshot 永远只读缓存。 */
export class AgentCapabilityCache {
  private readonly storage: AgentCapabilityRepository;
  private records: CachedAgentCapabilities[] = [];
  private states = new Map<AgentId, AgentCapabilityState>();
  private loaded: Promise<void> | null = null;
  private jobs = new Map<AgentId, Promise<void>>();
  private revisions = new Map<AgentId, number>();
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(filename: string, private readonly settings: AgentRepository, private readonly changed: () => void = () => undefined) {
    this.storage = new AgentCapabilityRepository(filename);
  }

  private load() {
    if (!this.loaded) this.loaded = this.storage.read().then(({ records, states }) => {
      this.records = records;
      this.states = new Map(states.map((state) => [state.installation.id, state]));
    }).catch((error) => { this.loaded = null; throw error; });
    return this.loaded;
  }

  private cached(id: AgentId, binaryPath?: string | null) {
    return this.records.filter((record) => record.agentId === id && (!binaryPath || record.binaryPath === binaryPath))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  }

  async snapshot(): Promise<AgentCapabilitySnapshot> {
    await this.load();
    const [settings, stored] = await Promise.all([this.settings.snapshot(), this.settings.read()]);
    const entries: AgentCapabilitySnapshot["entries"] = {};
    for (const config of stored.configurations) {
      const state = this.states.get(config.id);
      const record = this.cached(config.id, state?.installation.binaryPath) ?? this.cached(config.id);
      const changed = state?.configurationKey !== agentConfigurationKey(config);
      const unavailable = !config.enabled || (!changed && !canSelectTaskAgent(config, state?.installation));
      entries[config.id] = { capabilities: record?.capabilities ?? null,
        pending: !unavailable && (changed || (!state?.error && (Boolean(state?.invalidated) || !record))),
        error: unavailable ? "AGENT_UNAVAILABLE" : changed ? null : state?.error ?? null };
    }
    const installations = [...this.states.values()].filter((state) => {
      const config = stored.configurations.find((item) => item.id === state.installation.id);
      return config && state.configurationKey === agentConfigurationKey(config);
    }).map((state) => state.installation);
    return { settings, entries, installations };
  }

  start() {
    if (this.startupTimer || this.refreshTimer || this.stopped) return;
    void this.load().catch(() => undefined);
    this.startupTimer = setTimeout(() => { void this.refreshAll(); }, AGENT_CACHE_START_DELAY_MS);
    this.refreshTimer = setInterval(() => { void this.refreshAll(); }, AGENT_CACHE_MAX_AGE_MS);
    this.startupTimer.unref(); this.refreshTimer.unref();
  }

  async refreshAll() {
    if (this.stopped) return;
    await Promise.allSettled(AGENT_IDS.map((id) => this.refresh(id)));
  }

  /** 配置或登录操作发生变化时，旧结果可展示但不可作为新环境的有效配置。 */
  async invalidate(id: AgentId) {
    if (this.stopped) return;
    const revision = (this.revisions.get(id) ?? 0) + 1;
    this.revisions.set(id, revision);
    const current = () => !this.stopped && revision === this.revisions.get(id);
    await this.load();
    if (!current()) return;
    const state = this.states.get(id);
    if (state) {
      const invalidated = { ...state, invalidated: true, error: null };
      this.states.set(id, invalidated);
      await this.storage.save(invalidated, null, current);
    }
    this.changed();
    void this.refresh(id).catch(() => undefined);
  }

  refresh(id: AgentId): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const existing = this.jobs.get(id);
    if (existing) return existing;
    const job = (async () => {
      let revision: number;
      do {
        revision = this.revisions.get(id) ?? 0;
        await this.probe(id, revision);
      } while (!this.stopped && revision !== (this.revisions.get(id) ?? 0));
    })().finally(() => this.jobs.delete(id));
    this.jobs.set(id, job);
    return job;
  }

  private async probe(id: AgentId, revision: number) {
    const current = () => !this.stopped && revision === (this.revisions.get(id) ?? 0);
    await this.load();
    const config = (await this.settings.read()).configurations.find((item) => item.id === id);
    if (!config?.enabled || !current()) return;
    let state: AgentCapabilityState = { installation: this.states.get(id)?.installation ?? { id, status: "error", auth: "unknown", binaryPath: null, version: null, source: null, actions: [] },
      configurationKey: agentConfigurationKey(config), fingerprint: null, invalidated: true, error: null };
    let record: CachedAgentCapabilities | null = null;
    try {
      const env = { ...await agentShellEnvironment(), ...this.settings.environment(config) };
      if (!current()) return;
      state.installation = await detectAgent(config, env);
      if (!current()) return;
      if (!canSelectTaskAgent(config, state.installation)) throw new Error("AGENT_UNAVAILABLE");
      if (!state.installation.binaryPath) throw new Error("AGENT_CAPABILITIES_FAILED");
      state.fingerprint = await agentCapabilityFingerprint(config, state.installation, env);
      const cached = this.cached(id, state.installation.binaryPath);
      const usable = cached?.fingerprint === state.fingerprint && !this.states.get(id)?.invalidated;
      state.invalidated = !usable;
      if (!current()) return;
      this.states.set(id, state); this.changed();
      if (!usable || Date.now() - cached.updatedAt >= AGENT_CACHE_MAX_AGE_MS || cached.updatedAt > Date.now()) {
        const capabilities = await readAgentCapabilities(id, state.installation.binaryPath, env);
        record = { agentId: id, binaryPath: state.installation.binaryPath, fingerprint: state.fingerprint, capabilities, updatedAt: Date.now() };
      }
      state = { ...state, invalidated: false };
    } catch (error) {
      const cached = this.cached(id, state.installation.binaryPath);
      const usable = !state.invalidated && cached?.fingerprint === state.fingerprint;
      state = { ...state, error: usable ? null : error instanceof Error && error.message === "AGENT_UNAVAILABLE" ? "AGENT_UNAVAILABLE" : "AGENT_CAPABILITIES_FAILED" };
    }
    if (!current()) return;
    await this.storage.save(state, record, current);
    if (!current()) return;
    this.states.set(id, state);
    if (record) this.records = [...this.records.filter((item) => item.agentId !== id || item.binaryPath !== record.binaryPath), record];
    this.changed();
  }

  async installations(): Promise<AgentInstallation[]> {
    await this.load();
    return [...this.states.values()].map((state) => state.installation);
  }

  async stop() {
    this.stopped = true;
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    await this.loaded?.catch(() => undefined);
    await Promise.allSettled(this.jobs.values());
    await this.storage.flush();
  }
}
