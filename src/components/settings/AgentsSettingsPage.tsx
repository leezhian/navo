import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsList, SettingsPageHeader, SettingsRow } from "./settingsPrimitives";
import { useAgentSettings } from "@/hooks/useAgentSettings";
import { getAgentsApi } from "@/services/agentApi";
import { getAgentError } from "@/services/agentErrors";
import { agentNames } from "@/domain/agents";
import { AGENT_IDS } from "@/shared/agentTypes";
import type { AgentAction, AgentId, AgentOperationPlan } from "@/shared/agentTypes";
import { AgentSettingsCard } from "./agents/AgentSettingsCard";
const AgentOperationDialog = lazy(() => import("./agents/AgentOperationDialog").then((module) => ({ default: module.AgentOperationDialog })));

export function AgentsSettingsPage() {
  const { t } = useTranslation(["agents", "common"]);
  const settings = useAgentSettings();
  const [preparing, setPreparing] = useState(false);
  const [plans, setPlans] = useState<AgentOperationPlan[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const disabled = !settings.snapshot || settings.busy || preparing || plans !== null;
  const snapshot = settings.snapshot;
  const eligible = snapshot?.configurations.filter((config) => config.enabled && settings.installations.some((item) => item.id === config.id && item.status === "installed")) ?? [];
  const invalidDefault = snapshot?.defaultAgent && !eligible.some((config) => config.id === snapshot.defaultAgent);
  const updatable = settings.installations.filter((item) => item.actions.includes("update"));
  async function prepare(ids: AgentId[], action: AgentAction) {
    setPreparing(true); setError(null);
    try {
      const prepared: AgentOperationPlan[] = [];
      for (const id of ids) prepared.push(await getAgentsApi().prepare(id, action));
      setPlans(prepared);
    } catch (failure) { setError(failure); await getAgentsApi().discardPlans().catch(() => undefined); }
    finally { setPreparing(false); }
  }
  async function documentation(id: AgentId) {
    try { await getAgentsApi().openDocumentation(id); }
    catch (failure) { setError(failure); }
  }
  return <>
    <SettingsPageHeader title={t("agents:title")} />
    <div className="mb-6"><SettingsList><SettingsRow title={t("agents:default.title")} description={t("agents:default.description")}>
      <Select disabled={disabled || !snapshot} value={snapshot?.defaultAgent ?? "none"} onValueChange={(value) => void settings.setDefault(value === "none" ? null : value as AgentId)}>
        <SelectTrigger className="h-8 w-48 text-xs" aria-label={t("agents:default.title")}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="none">{t("agents:default.none")}</SelectItem>
          {invalidDefault && snapshot?.defaultAgent && <SelectItem value={snapshot.defaultAgent} disabled>{agentNames[snapshot.defaultAgent]} · {t("agents:status.unavailable")}</SelectItem>}
          {eligible.map((config) => <SelectItem value={config.id} key={config.id}>{agentNames[config.id]}</SelectItem>)}
        </SelectContent>
      </Select>
    </SettingsRow></SettingsList>{invalidDefault && <p className="mt-2 text-xs text-destructive">{t("agents:default.unavailable")}</p>}</div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-medium">{t("agents:list")}</h2><div className="flex gap-2">
      <Button variant="ghost" size="sm" disabled={disabled || updatable.length === 0} onClick={() => void prepare(updatable.map((item) => item.id), "update")}>{t("agents:actions.updateAll")}</Button>
      <Button variant="ghost" size="sm" disabled={settings.busy || preparing || plans !== null} onClick={() => void settings.refresh()}><RefreshCw className="size-3.5" />{t("agents:actions.scan")}</Button>
    </div></div>
    {(error !== null || settings.error !== null) && <p role="alert" className="mb-3 text-xs text-destructive">{getAgentError(error ?? settings.error)}</p>}
    <div className="space-y-3">{AGENT_IDS.map((id) => <AgentSettingsCard key={id} id={id} config={snapshot?.configurations.find((config) => config.id === id)} installation={settings.installations.find((item) => item.id === id)} disabled={disabled}
      onSave={settings.save} onAction={(action) => void prepare([id], action)} onDocumentation={() => void documentation(id)} />)}</div>
    {plans && <Suspense fallback={<p role="status" className="mt-3 text-xs text-muted-foreground">{t("agents:operation.waiting")}</p>}><AgentOperationDialog plans={plans} onClose={() => { setPlans(null); void getAgentsApi().discardPlans().catch(() => undefined); }} /></Suspense>}
  </>;
}
