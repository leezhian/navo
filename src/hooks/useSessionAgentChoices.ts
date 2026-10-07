import { useEffect, useState } from "react";
import type { AgentCapabilitySnapshot } from "@/shared/agentCapabilities";
import { getAgentsApi, readAgentCapabilitySnapshot } from "@/services/agentApi";
import { canSelectTaskAgent } from "@/domain/agents";

/** 两个新建入口共用缓存快照；展开菜单不检测 CLI，也不复用旧会话配置。 */
export function useSessionAgentChoices() {
  const [snapshot, setSnapshot] = useState<AgentCapabilitySnapshot | null>(null);
  useEffect(() => {
    let disposed = false;
    let revision = 0;
    async function refresh() {
      const current = ++revision;
      try {
        const next = await readAgentCapabilitySnapshot();
        if (!disposed && current === revision) setSnapshot(next);
      } catch { /* 快照读取失败时保留已有选项；提交仍由主进程校验。 */ }
    }
    let unsubscribe: (() => void) | undefined;
    try { unsubscribe = getAgentsApi().onCapabilitiesChanged(() => void refresh()); } catch { /* 浏览器预览不具备 Agent 能力。 */ }
    void refresh();
    return () => { disposed = true; unsubscribe?.(); };
  }, []);
  return snapshot?.settings.configurations.filter((config) => canSelectTaskAgent(config, snapshot.installations.find((item) => item.id === config.id)))
    .map((config) => ({ id: config.id, ready: Boolean(snapshot.entries[config.id]?.capabilities && !snapshot.entries[config.id]?.pending && !snapshot.entries[config.id]?.error) })) ?? [];
}
