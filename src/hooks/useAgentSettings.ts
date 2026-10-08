import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentId, AgentInstallation, AgentSettingsSnapshot, SaveAgentConfiguration } from "@/shared/agentTypes";
import { getAgentsApi, readAgentCapabilitySnapshot } from "@/services/agentApi";

// 切回页面立即复用上次展示内容；主进程快照负责跨窗口和重启后的恢复。
let cachedSnapshot: AgentSettingsSnapshot | null = null;
let cachedInstallations: AgentInstallation[] = [];

export function useAgentSettings() {
  const [snapshot, setSnapshot] = useState<AgentSettingsSnapshot | null>(cachedSnapshot);
  const [installations, setInstallations] = useState<AgentInstallation[]>(cachedInstallations);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busyRef = useRef(false);
  const request = useRef(0);
  const lifecycle = useRef(0);
  const readSnapshot = useCallback(async () => {
    const token = ++request.current;
    try {
      const result = await readAgentCapabilitySnapshot();
      if (token !== request.current) return;
      cachedSnapshot = result.settings; cachedInstallations = result.installations;
      setSnapshot(result.settings); setInstallations(result.installations);
    } catch (failure) { if (token === request.current) setError(failure); }
  }, []);
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try { unsubscribe = getAgentsApi().onCapabilitiesChanged(() => void readSnapshot()); }
    catch (failure) { setError(failure); }
    void readSnapshot();
    return () => { request.current += 1; lifecycle.current += 1; unsubscribe?.(); };
  }, [readSnapshot]);

  async function runAction(action: () => Promise<unknown>) {
    if (busyRef.current) return false;
    const generation = lifecycle.current;
    request.current += 1;
    busyRef.current = true;
    setBusy(true); setError(null);
    try {
      await action();
      if (generation !== lifecycle.current) return false;
      await readSnapshot();
      return true;
    } catch (failure) { if (generation === lifecycle.current) setError(failure); return false; }
    finally { busyRef.current = false; if (generation === lifecycle.current) setBusy(false); }
  }
  function save(input: SaveAgentConfiguration, rescan = false) {
    return runAction(async () => {
      await getAgentsApi().save(input);
      if (rescan) await getAgentsApi().scan(input.id);
    });
  }
  function setDefault(id: AgentId | null) { return runAction(() => getAgentsApi().setDefault(id)); }
  function refresh() { return runAction(() => getAgentsApi().scan()); }
  return { snapshot, installations, busy, error, save, setDefault, refresh };
}
