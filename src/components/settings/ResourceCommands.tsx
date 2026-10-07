import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Terminal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { RESOURCE_COMMAND_LIMIT } from "@/shared/settingsTypes";
import type { ResourceCommand } from "@/shared/settingsTypes";
import { ResourceCommandEditor } from "./ResourceCommandEditor";

interface ResourceCommandsProps {
  /** 父表单持有的命令列表，数组顺序即保存顺序。 */
  commands: ResourceCommand[];
  /** 保存资源或选择目录期间禁止修改。 */
  disabled: boolean;
  /** 增删改只更新草稿，随资源的保存按钮统一持久化。 */
  onChange: (commands: ResourceCommand[]) => void;
  /** 命令编辑未确认时禁止提交父表单，避免静默丢弃。 */
  onEditingChange: (editing: boolean) => void;
}

export function ResourceCommands({ commands, disabled, onChange, onEditingChange }: ResourceCommandsProps) {
  const { t } = useTranslation(["common", "settings"]);
  const [editing, setEditing] = useState<ResourceCommand | null>(null);
  function edit(command: ResourceCommand | null) { setEditing(command); onEditingChange(Boolean(command)); }
  function confirm(command: ResourceCommand) {
    onChange(commands.some((item) => item.id === command.id) ? commands.map((item) => item.id === command.id ? command : item) : [...commands, command]);
    edit(null);
  }

  return <section className="grid gap-2" aria-label={t("settings:resources.commands.title")}>
    <div className="flex items-center justify-between">
      <h3 className="text-xs font-medium">{t("settings:resources.commands.title")}</h3>
      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" disabled={disabled || Boolean(editing) || commands.length >= RESOURCE_COMMAND_LIMIT}
        onClick={() => edit({ id: crypto.randomUUID(), name: "", script: "", runOnWorktreeCreation: false })}><Plus className="size-3.5" />{t("settings:resources.commands.add")}</Button>
    </div>
    {commands.map((command) => editing?.id === command.id
      ? <ResourceCommandEditor key={command.id} command={editing} disabled={disabled} onConfirm={confirm} onCancel={() => edit(null)} />
      : <div key={command.id} data-slot="resource-command-row" className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/50">
        <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-xs font-medium">{command.name}</span>
          {command.runOnWorktreeCreation && <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{t("settings:resources.commands.automatic")}</span>}
        </div><p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={command.script}>{command.script}</p></div>
        <IconTooltip label={t("common:actions.edit") + ": " + command.name} size="icon-sm" variant="ghost" disabled={disabled || Boolean(editing)} onClick={() => edit(command)}><Pencil className="size-3.5" /></IconTooltip>
        <IconTooltip label={t("common:actions.remove") + ": " + command.name} size="icon-sm" variant="ghost" className="hover:bg-destructive/10 hover:text-destructive" disabled={disabled || Boolean(editing)} onClick={() => onChange(commands.filter((item) => item.id !== command.id))}><Trash2 className="size-3.5" /></IconTooltip>
      </div>)}
    {editing && !commands.some((command) => command.id === editing.id) && <ResourceCommandEditor key={editing.id} command={editing} disabled={disabled} onConfirm={confirm} onCancel={() => edit(null)} />}
  </section>;
}
