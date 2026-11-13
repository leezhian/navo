import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { agentNames } from "@/domain/agents";
import type { TaskAgentSelection } from "@/shared/agentCapabilities";
import type { AgentId } from "@/shared/agentTypes";
import type { useTaskAgentOptions } from "@/hooks/useTaskAgentOptions";
import { availableAgentModes, defaultAgentSelection } from "@/utils/taskAgentSelection";
import { TaskAgentEffortSlider } from "./TaskAgentEffortSlider";

interface TaskAgentOptionsProps {
  /** 当前任务的配置快照，不修改全局默认值。 */
  value: TaskAgentSelection | null;
  /** 本机 Agent 状态及后台更新的真实能力缓存。 */
  options: ReturnType<typeof useTaskAgentOptions>;
  /** 选择立即回写草稿，保留仍兼容的模式。 */
  onChange: (selection: TaskAgentSelection) => void;
}

const triggerClassName = "h-7 w-full min-w-0 border-transparent bg-muted/50 text-xs shadow-none";

export function TaskAgentOptions({ value, options, onChange }: TaskAgentOptionsProps) {
  const { t } = useTranslation(["taskCreate", "agents"]);
  const capabilities = options.capabilities?.agentId === options.activeId ? options.capabilities : null;
  const current = value?.agentId === capabilities?.agentId ? value : null;
  const model = capabilities?.models.find((item) => item.id === current?.modelId);
  const modes = capabilities && model ? availableAgentModes(capabilities, model.id) : [];
  const disabled = options.busy || options.pending || options.error !== null;
  const unavailable = options.activeId && !options.eligible.includes(options.activeId);
  const loading = options.pending ? t("taskCreate:agent.pending") : options.busy ? t("taskCreate:agent.loading") : "—";

  return <>
    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-xs">
      <span className="text-muted-foreground">Agent</span>
      <Select value={options.activeId ?? ""} disabled={options.busy || !options.eligible.length} onValueChange={(id) => void options.choose(id as AgentId)}>
        <SelectTrigger className={triggerClassName} aria-label={t("taskCreate:agent.select")}><SelectValue placeholder={loading} /></SelectTrigger>
        <SelectContent position="popper">{unavailable && options.activeId && <SelectItem disabled value={options.activeId}>{agentNames[options.activeId]} · {t("agents:status.unavailable")}</SelectItem>}
          {options.eligible.map((id) => <SelectItem key={id} value={id}>{agentNames[id]}</SelectItem>)}</SelectContent>
      </Select>
      <span className="text-muted-foreground">{t("taskCreate:agent.model")}</span>
      <Select value={current?.modelId ?? ""} disabled={disabled || !capabilities} onValueChange={(id) => {
        if (!capabilities) return;
        const next = defaultAgentSelection(capabilities, id);
        if (current && availableAgentModes(capabilities, id).some((mode) => mode.id === current.modeId)) { next.modeId = current.modeId; next.modeName = current.modeName; }
        onChange(next);
      }}>
        <SelectTrigger className={triggerClassName} aria-label={t("taskCreate:agent.model")}><SelectValue placeholder={loading} /></SelectTrigger>
        <SelectContent position="popper">{capabilities?.models.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
      </Select>
      <span className="text-muted-foreground">{t("taskCreate:agent.mode")}</span>
      <Select value={current?.modeId ?? ""} disabled={disabled || !modes.length} onValueChange={(id) => {
        const mode = modes.find((item) => item.id === id);
        if (current && mode) onChange({ ...current, modeId: mode.id, modeName: mode.name });
      }}>
        <SelectTrigger className={triggerClassName} aria-label={t("taskCreate:agent.mode")}><SelectValue placeholder={loading} /></SelectTrigger>
        <SelectContent position="popper">{modes.map((mode) => <SelectItem key={mode.id} value={mode.id}>{mode.name}</SelectItem>)}</SelectContent>
      </Select>
      <span className="text-muted-foreground">{t("taskCreate:agent.effort")}</span>
      {model && current && model.efforts.length > 0
        ? <TaskAgentEffortSlider efforts={model.efforts} value={current.effort} disabled={disabled} onChange={(effort) => onChange({ ...current, effort })} />
        : <span className="py-1.5 text-muted-foreground">{model ? t("taskCreate:agent.noEffort") : loading}</span>}
    </div>
    {current?.modeId === "bypassPermissions" && <p className="mt-2 text-xs text-destructive">{t("taskCreate:agent.bypassWarning")}</p>}
    {!options.busy && !options.eligible.length && <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("taskCreate:agent.empty")}</p>}
    <div className="mt-2 flex justify-end border-t pt-2">
      <Button variant="ghost" size="sm" className="h-7 text-xs font-normal" disabled={options.busy || !options.defaultId || !options.eligible.includes(options.defaultId)} onClick={() => { if (options.defaultId) void options.choose(options.defaultId); }}>{t("taskCreate:agent.useDefault")}</Button>
    </div>
  </>;
}
