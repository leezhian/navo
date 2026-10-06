import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentId, AgentInstallation, AgentSettingsSnapshot, SaveAgentConfiguration } from "@/shared/agentTypes";
import { getAgentsApi } from "@/services/agentApi";

// 仅缓存本次应用运行的检测结果，切回设置页时先保留内容，再后台刷新。
let cachedSnapshot: AgentSettingsSnapshot | null = null;
let cachedInstallations: AgentInstallation[] = [];

export function useAgentSettings() {
  const [snapshot, setSnapshot] = useState<AgentSettingsSnapshot | null>(cachedSnapshot);
  const [installations, setInstallations] = useState<AgentInstallation[]>(cachedInstallations);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busyRef = useRef(false);
  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(null);
    try {
      const api = getAgentsApi();
      const [settings, detected] = await Promise.all([api.load(), api.scan()]);
      cachedSnapshot = settings; cachedInstallations = detected;
      setSnapshot(settings); setInstallations(detected);
    } catch (failure) { setError(failure); }
    finally { busyRef.current = false; setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function save(input: SaveAgentConfiguration) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true); setError(null);
    try {
      const saved = await getAgentsApi().save(input);
      cachedSnapshot = saved;
      setSnapshot(saved);
      const detected = await getAgentsApi().scan();
      cachedInstallations = detected;
      setInstallations(detected);
      return true;
    } catch (failure) { setError(failure); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function setDefault(id: AgentId | null) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(null);
    try {
      const saved = await getAgentsApi().setDefault(id);
      cachedSnapshot = saved;
      setSnapshot(saved);
    }
    catch (failure) { setError(failure); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return { snapshot, installations, busy, error, save, setDefault, refresh };
}
