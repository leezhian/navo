import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { Collapsible } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { agentNames } from "@/domain/agents";
import type { AgentAction, AgentConfiguration, AgentId, AgentInstallation, SaveAgentConfiguration } from "@/shared/agentTypes";
import { AgentAdvancedSettings } from "./AgentAdvancedSettings";

interface AgentSettingsCardProps {
  /** 固定展示四种 CLI，不依赖首次异步读取完成。 */
  id: AgentId;
  /** 当前 CLI 的持久化配置和最近一次真实检测结果。 */
  config?: AgentConfiguration;
  installation?: AgentInstallation;
  /** 扫描、保存或准备操作时禁用冲突按钮。 */
  disabled: boolean;
  /** 保存配置，不修改 CLI 自身全局配置。 */
  onSave: (input: SaveAgentConfiguration) => Promise<boolean>;
  /** 准备命令并打开确认面板，不立即执行。 */
  onAction: (action: AgentAction) => void;
  /** 打开固定的厂商官方说明地址。 */
  onDocumentation: () => void;
}

export function AgentSettingsCard({ id, config, installation, disabled, onSave, onAction, onDocumentation }: AgentSettingsCardProps) {
  const { t } = useTranslation(["agents", "common"]);
  const installed = installation?.status === "installed";
  const actions = installation?.actions ?? [];
  const signedIn = installation?.auth === "signedIn";
  const status = installation?.status === "error" ? "agents:status.detectionFailed" : installed ? "agents:status.installed" : "agents:status.notInstalled";
  const auth = signedIn ? "agents:auth.signedIn" : installation?.auth === "signedOut" ? "agents:auth.signedOut" : "agents:auth.unknown";
  return <section className="settings-list" aria-label={agentNames[id]}>
    <div className="flex min-h-16 flex-wrap items-center gap-3 py-4">
      <h2 className="text-sm font-medium">{agentNames[id]}</h2>
      <span className="text-xs text-muted-foreground">{installation ? installation.version ?? t(status) : "—"}</span>
      <div className="ml-auto flex items-center gap-3">
      {actions.includes("install") && <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onAction("install")}>{t("agents:actions.install")}</Button>}
      {actions.includes("update") && <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onAction("update")}>{t("agents:actions.update")}</Button>}
      {installation && !actions.includes("install") && !actions.includes("update") && <Button variant="ghost" size="sm" disabled={disabled} onClick={onDocumentation}>{t("agents:actions.instructions")}</Button>}
      <Switch aria-label={`${t("agents:enabled")} ${agentNames[id]}`} disabled={disabled || !config} checked={config?.enabled ?? false} onCheckedChange={(enabled) => { if (config) void onSave({ ...config, enabled, environment: config.environmentNames.map((name) => ({ name })) }); }} />
      </div>
    </div>
    {(installed || !installation) && <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-t border-border py-3 text-xs">
      <div><p>{t("agents:account")}</p><p className="mt-1 text-muted-foreground">{installation ? t(auth) : "—"}{installation?.identity ? " · " + installation.identity : ""}</p></div>
      <div className="flex gap-2">
        {actions.includes("manageLogin") && <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onAction("manageLogin")}>{t("agents:actions.manageLogin")}</Button>}
        {actions.includes("login") && !signedIn && <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onAction("login")}>{t("agents:actions.login")}</Button>}
        {actions.includes("logout") && installation?.auth !== "signedOut" && <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onAction("logout")}>{t("agents:actions.logout")}</Button>}
      </div>
    </div>}
    <Collapsible.Root>
      <Collapsible.Trigger asChild><Button disabled={!config} variant="ghost" className="my-2 h-8 w-full justify-start px-0 text-xs font-normal [&[data-state=open]>svg]:rotate-180"><ChevronDown className="size-3.5 transition-transform" />{t("agents:advanced.title")}</Button></Collapsible.Trigger>
      <Collapsible.Content>{config && <AgentAdvancedSettings key={JSON.stringify(config)} config={config} installation={installation} disabled={disabled} onSave={onSave} />}</Collapsible.Content>
    </Collapsible.Root>
  </section>;
}
