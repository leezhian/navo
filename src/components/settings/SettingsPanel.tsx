import { IconTooltip } from "@/components/ui/icon-tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { defaultSettings } from "../../domain/mockData";
import type { AgentType, AppSettings } from "../../domain/types";
import { ArrowLeft } from "lucide-react";

interface SettingsPanelProps {
  /** 当前本地偏好设置。 */
  settings: AppSettings;
  /** 点击返回按钮时退出设置页并回到审查页。 */
  onBack: () => void;
  /** 更新本地偏好设置，例如 Agent 开关和主题。 */
  updateSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export function SettingsPanel({ settings, onBack, updateSettings }: SettingsPanelProps) {
  const agents = Object.keys(defaultSettings.enabledAgents) as AgentType[];

  return (
    <div className="h-full overflow-auto p-9">
      <header className="mb-8 flex items-center gap-3.5">
        <IconTooltip label="返回" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </IconTooltip>
        <p className="text-sm text-muted-foreground">偏好设置</p>
      </header>

      <section className="mb-8 max-w-[720px]">
        <h2 className="mb-3 text-lg font-semibold">集成</h2>
        <div className="overflow-hidden rounded-xl border">
          {agents.map((agent) => (
            <div
              className="flex min-h-14 items-center justify-between gap-4 border-b px-4 last:border-b-0"
              key={agent}
            >
              <span className="text-sm font-normal">{agent}</span>
              <Switch
                aria-label={`启用 ${agent}`}
                checked={settings.enabledAgents[agent]}
                onCheckedChange={(enabled) => updateAgent(agent, enabled, updateSettings)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-[720px]">
        <h2 className="mb-3 text-lg font-semibold">外观</h2>
        <Select
          value={settings.theme}
          onValueChange={(theme) =>
            updateSettings((current) => ({
              ...current,
              theme: theme as AppSettings["theme"],
            }))
          }
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">跟随系统</SelectItem>
            <SelectItem value="light">浅色</SelectItem>
            <SelectItem value="dark">深色</SelectItem>
          </SelectContent>
        </Select>
      </section>
    </div>
  );
}

function updateAgent(
  agent: AgentType,
  enabled: boolean,
  updateSettings: React.Dispatch<React.SetStateAction<AppSettings>>,
) {
  updateSettings((current) => ({
    ...current,
    enabledAgents: {
      ...current.enabledAgents,
      [agent]: enabled,
    },
    agentStatuses: {
      ...current.agentStatuses,
      [agent]: enabled ? "listening" : "disabled",
    },
  }));
}
