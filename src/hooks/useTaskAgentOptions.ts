import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentId } from "@/shared/agentTypes";
import type { AgentCapabilitySnapshot, TaskAgentSelection } from "@/shared/agentCapabilities";
import { getAgentsApi, readAgentCapabilitySnapshot } from "@/services/agentApi";
import { defaultAgentSelection, matchesAgentCapabilities } from "@/utils/taskAgentSelection";
import { canSelectTaskAgent } from "@/domain/agents";

/** 挂载时预载 SQLite 快照并订阅更新；打开弹窗与切换 Agent 不触发 CLI 查询。 */
export function useTaskAgentOptions(open: boolean, selection: TaskAgentSelection | null, onChange: (selection: TaskAgentSelection | null) => void) {
  const [snapshot, setSnapshot] = useState<AgentCapabilitySnapshot | null>(null);
  const [chosenId, setChosenId] = useState<AgentId | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const request = useRef(0);
  const currentSelection = useRef(selection);
  currentSelection.current = selection;

  const refresh = useCallback(async () => {
    const token = ++request.current;
    try {
      const result = await readAgentCapabilitySnapshot();
      if (token !== request.current) return;
      setSnapshot(result); setLoadError(null);
    } catch (error) { if (token === request.current) setLoadError(error); }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try { unsubscribe = getAgentsApi().onCapabilitiesChanged(() => { void refresh(); }); }
    catch (error) { setLoadError(error); }
    void refresh();
    return () => { request.current += 1; unsubscribe?.(); };
  }, [refresh]);

  const eligible = snapshot?.settings.configurations.filter((config) => canSelectTaskAgent(config, snapshot.installations.find((item) => item.id === config.id))).map((config) => config.id) ?? [];
  const defaultId = snapshot?.settings.defaultAgent ?? null;
  const activeId = chosenId ?? selection?.agentId ?? defaultId ?? eligible[0] ?? null;
  const entry = activeId ? snapshot?.entries[activeId] : null;
  const capabilities = entry?.capabilities ?? null;
  const unavailable = Boolean(snapshot && activeId && !eligible.includes(activeId));
  const error = loadError ?? (unavailable ? "AGENT_UNAVAILABLE" : entry?.error ?? null);
  const pending = Boolean(activeId && !unavailable && !error && (!capabilities || entry?.pending));

  useEffect(() => {
    if (!open || !capabilities || pending || error) return;
    const previous = currentSelection.current;
    const model = capabilities.models.find((item) => item.id === previous?.modelId);
    const mode = capabilities.modes.find((item) => item.id === previous?.modeId);
    const next = previous && model && mode && matchesAgentCapabilities(previous, capabilities) ? {
      ...previous, modelName: model.name, modeName: mode.name,
    } : defaultAgentSelection(capabilities);
    if (JSON.stringify(previous) !== JSON.stringify(next)) onChange(next);
  }, [open, capabilities, pending, error, onChange]);

  useEffect(() => { if (!open && !selection) setChosenId(null); }, [open, selection]);

  function choose(id: AgentId) {
    if (!eligible.includes(id)) return;
    setChosenId(id);
    const selected = snapshot?.entries[id];
    if (selected?.capabilities && !selected.pending && !selected.error) onChange(defaultAgentSelection(selected.capabilities));
  }
  return { eligible, defaultId, activeId, capabilities, pending, busy: !snapshot && !loadError, error, refresh, choose };
}
