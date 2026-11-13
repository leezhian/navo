import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RESOURCE_COMMAND_NAME_MAX_LENGTH, RESOURCE_COMMAND_SCRIPT_MAX_LENGTH } from "@/shared/settingsTypes";
import type { ResourceCommand } from "@/shared/settingsTypes";

interface ResourceCommandEditorProps {
  /** 当前命令草稿；调用方用 id 作为 key，切换命令时重新初始化。 */
  command: ResourceCommand;
  /** 保存资源或选择目录期间禁用编辑。 */
  disabled: boolean;
  /** 只修改父表单草稿，不持久化、不执行命令。 */
  onConfirm: (command: ResourceCommand) => void;
  /** 丢弃本次命令编辑，保留父表单其他字段。 */
  onCancel: () => void;
}

export function ResourceCommandEditor({ command, disabled, onConfirm, onCancel }: ResourceCommandEditorProps) {
  const { t } = useTranslation(["common", "settings"]);
  const checkboxId = useId();
  const [name, setName] = useState(command.name);
  const [script, setScript] = useState(command.script);
  const [runOnWorktreeCreation, setRunOnWorktreeCreation] = useState(command.runOnWorktreeCreation);
  const valid = Boolean(name.trim() && script.trim()) && !/[\r\n\0]/.test(name) && !script.includes("\0");

  return <div data-slot="resource-command-editor" className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3">
    <label className="grid gap-1.5 text-xs">{t("settings:resources.commands.name")}
      <Input autoFocus disabled={disabled} value={name} maxLength={RESOURCE_COMMAND_NAME_MAX_LENGTH} placeholder={t("settings:resources.commands.namePlaceholder")} onChange={(event) => setName(event.target.value)} />
    </label>
    <label className="grid gap-1.5 text-xs">{t("settings:resources.commands.script")}
      <Textarea disabled={disabled} value={script} maxLength={RESOURCE_COMMAND_SCRIPT_MAX_LENGTH} rows={3} className="max-h-48 min-h-20 resize-y font-mono text-xs" placeholder={t("settings:resources.commands.scriptPlaceholder")} onChange={(event) => setScript(event.target.value)} />
    </label>
    <div className="flex items-center gap-2">
      <Checkbox id={checkboxId} disabled={disabled} checked={runOnWorktreeCreation} onCheckedChange={(checked) => setRunOnWorktreeCreation(checked === true)} />
      <label htmlFor={checkboxId} className="text-xs">{t("settings:resources.commands.runOnWorktreeCreation")}</label>
    </div>
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onCancel}>{t("common:actions.cancel")}</Button>
      <Button type="button" size="sm" disabled={disabled || !valid} onClick={() => onConfirm({ ...command, name: name.trim(), script, runOnWorktreeCreation })}>{t("common:actions.confirm")}</Button>
    </div>
  </div>;
}
