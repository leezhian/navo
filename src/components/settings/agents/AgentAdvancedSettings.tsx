import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { getAgentsApi } from "@/services/agentApi";
import { getAgentError } from "@/services/agentErrors";
import type { AgentConfiguration, AgentInstallation, SaveAgentConfiguration } from "@/shared/agentTypes";

interface AgentAdvancedSettingsProps {
  /** 已保存的配置，路径仅通过文件选择或自动扫描修改。 */
  config: AgentConfiguration;
  /** 自动检测到的可执行文件，用于展示实际生效路径。 */
  installation?: AgentInstallation;
  /** 探测或其他设置操作期间禁止冲突提交。 */
  disabled: boolean;
  /** 自动保存所选路径；空路径会清除自定义覆盖并重新检测。 */
  onSave: (input: SaveAgentConfiguration) => Promise<boolean>;
}

export function AgentAdvancedSettings({ config, installation, disabled, onSave }: AgentAdvancedSettingsProps) {
  const { t } = useTranslation(["agents"]);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const savingRef = useRef(false);
  const busy = disabled || choosing;
  const binaryPath = config.customPath || installation?.binaryPath || "";
  async function savePath(customPath: string) {
    if (disabled || savingRef.current) return;
    savingRef.current = true;
    setError(null);
    // 空路径即恢复自动发现；即使已处于自动模式，也必须重新扫描。
    try { await onSave({ ...config, customPath, environment: config.environmentNames.map((name) => ({ name })) }); }
    catch (failure) { setError(failure); }
    finally { savingRef.current = false; }
  }
  async function choose() {
    setChoosing(true); setError(null);
    try { const filename = await getAgentsApi().chooseBinary(); if (filename && filename !== config.customPath) await savePath(filename); }
    catch (failure) { setError(failure); }
    finally { setChoosing(false); }
  }
  return <div className="space-y-4 border-t border-border py-4">
    <div className="grid gap-2 text-xs"><p>{t("agents:advanced.binary")}</p>
      <div className="flex items-center gap-2"><Input aria-label={t("agents:advanced.binary")} className="h-8 min-w-0 flex-1 font-mono text-xs" readOnly value={binaryPath} placeholder={t("agents:advanced.autoPath")} title={binaryPath || undefined} />
        <Button variant="ghost" size="sm" className="h-8" disabled={busy} onClick={() => void savePath("")}><RefreshCw className="size-3.5" />{t("agents:actions.scan")}</Button>
        <IconTooltip label={t("agents:advanced.chooseBinary")} variant="secondary" size="icon" disabled={busy} onClick={() => void choose()}><FolderOpen className="size-4" /></IconTooltip></div>
    </div>
    {error !== null && <p role="alert" className="text-xs text-destructive">{getAgentError(error)}</p>}
  </div>;
}
