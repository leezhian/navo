import { useRef, useState } from "react";
import { ChevronDown, LoaderCircle, Play, Settings2, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskResource } from "@/shared/taskTypes";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { ButtonGroup } from "@/components/ui/button-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ResourceDialog } from "@/components/settings/ResourceDialog";
import { useResourceStore } from "@/stores/resourceStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorkspaceCommands } from "@/hooks/useWorkspaceCommands";
import { WorkspaceCommandMenuItem } from "./WorkspaceCommandMenuItem";

interface WorkspaceCommandActionsProps {
  /** 最近运行记录按任务与工作区隔离。 */
  taskId: string;
  /** 命令属于全局仓库，执行目录属于当前任务工作区，不能混用两个 ID。 */
  resource: TaskResource;
  /** 当前任务的终端记录，用于定位正在运行的命令。 */
  sessions: TaskSession[];
  disabled: boolean;
  /** 显式选择后启动已保存命令，并展示对应任务终端。 */
  onRun: (resourceId: string, commandId: string) => void;
}

export function WorkspaceCommandActions({ taskId, resource, sessions, disabled, onRun }: WorkspaceCommandActionsProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const repositoriesDirectory = useSettingsStore((state) => state.settings.repositoriesDirectory);
  const [managing, setManaging] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { repository, error, active, preferred, menuCommands, select, savingDefault, defaultFailed, pin } = useWorkspaceCommands(taskId, resource, sessions, onRun);
  const shortcutLabel = active ? t("tasks:commands.stop", { name: active.command?.name })
    : preferred ? t("tasks:commands.run", { name: preferred.name }) : t("tasks:commands.empty");
  function runShortcut() {
    const commandId = active?.command?.id ?? preferred?.id;
    if (!disabled && commandId) select(commandId);
  }
  return <>
    {menuCommands.length > 0 && <ButtonGroup className="shrink-0" aria-label={t("tasks:commands.title")}>
      <IconTooltip label={shortcutLabel} size="icon-xs" variant="ghost" className="size-5 border-0" disabled={disabled || (!active && !preferred)} onClick={runShortcut}>
        {active?.status === "starting" ? <LoaderCircle className="size-3 animate-spin" /> : active ? <Square className="size-3" /> : <Play className="size-3" />}
      </IconTooltip>
    <DropdownMenu><DropdownMenuTrigger asChild>
      <IconTooltip ref={trigger} label={t("tasks:commands.choose")} size="icon-xs" variant="ghost" className="h-5 w-4 border-0" disabled={disabled}><ChevronDown className="size-3" /></IconTooltip>
    </DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48">
      {menuCommands.map(({ id, name, activeStatus, pinned, canPin }) => (
        <WorkspaceCommandMenuItem key={id} Item={DropdownMenuItem} name={name} activeStatus={activeStatus} disabled={disabled}
          pinned={pinned} savingDefault={savingDefault} onSelectCommand={() => select(id)}
          onToggleDefault={canPin ? () => void pin(pinned ? null : id) : undefined} />
      ))}
      {error !== null && <DropdownMenuItem onSelect={() => void useResourceStore.getState().refresh()}>{t("common:actions.retry")}</DropdownMenuItem>}
      <DropdownMenuSeparator />
      {defaultFailed && <p role="alert" className="px-2 py-1 text-xs text-destructive">{t("tasks:commands.setDefaultFailed")}</p>}
      <DropdownMenuItem disabled={!repository || disabled} onSelect={() => setManaging(true)}><Settings2 className="size-3.5" />{t("tasks:commands.manage")}</DropdownMenuItem>
    </DropdownMenuContent></DropdownMenu>
    </ButtonGroup>}
    {managing && repository && <ResourceDialog record={repository} repositoriesDirectory={repositoriesDirectory} onClose={() => setManaging(false)} onReturnFocus={() => trigger.current?.focus()} />}
  </>;
}
