import { useEffect, useRef, useState } from "react";
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
import { useTaskSessionStore } from "@/stores/taskSessionStore";

interface WorkspaceCommandActionsProps {
  /** 命令属于全局仓库，执行目录属于当前任务工作区，不能混用两个 ID。 */
  resource: TaskResource;
  /** 当前任务的终端记录，用于选择最近运行的命令及停止目标。 */
  sessions: TaskSession[];
  disabled: boolean;
  /** 显式选择后启动已保存命令，并展示对应任务终端。 */
  onRun: (resourceId: string, commandId: string) => void;
}

export function WorkspaceCommandActions({ resource, sessions, disabled, onRun }: WorkspaceCommandActionsProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const records = useResourceStore((state) => state.records);
  const error = useResourceStore((state) => state.error);
  const repositoriesDirectory = useSettingsStore((state) => state.settings.repositoriesDirectory);
  const [managing, setManaging] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const repository = records.find((record) => record.id === (resource.repositoryId ?? resource.resourceId));
  const commands = repository?.commands ?? [];
  const commandSessions = sessions.filter((session) => session.command?.resourceId === resource.resourceId);
  const running = commandSessions.filter((session) => ["starting", "running"].includes(session.status));
  const active = running[running.length - 1];
  const lastCommand = commandSessions[commandSessions.length - 1]?.command;
  const preferred = commands.find((command) => command.id === lastCommand?.id) ?? commands[0];
  const shortcutLabel = active ? t("tasks:commands.stop", { name: active.command?.name })
    : preferred ? t("tasks:commands.run", { name: preferred.name }) : t("tasks:commands.empty");
  const menuCommands = [...commands, ...running.flatMap((session) => session.command && !commands.some((command) => command.id === session.command?.id) ? [session.command] : [])];
  useEffect(() => {
    const resources = useResourceStore.getState();
    if (!resources.loaded) void resources.refresh();
  }, []);
  function runShortcut() {
    if (disabled) return;
    if (active) void useTaskSessionStore.getState().stop(active.id);
    else if (preferred) onRun(resource.resourceId, preferred.id);
  }
  return <>
    {menuCommands.length > 0 && <ButtonGroup className="shrink-0" aria-label={t("tasks:commands.title")}>
      <IconTooltip label={shortcutLabel} size="icon-xs" variant="ghost" className="size-5 border-0" disabled={disabled || (!active && !preferred)} onClick={runShortcut}>
        {active?.status === "starting" ? <LoaderCircle className="size-3 animate-spin" /> : active ? <Square className="size-3" /> : <Play className="size-3" />}
      </IconTooltip>
    <DropdownMenu><DropdownMenuTrigger asChild>
      <IconTooltip ref={trigger} label={t("tasks:commands.choose")} size="icon-xs" variant="ghost" className="h-5 w-4 border-0" disabled={disabled}><ChevronDown className="size-3" /></IconTooltip>
    </DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48">
      {menuCommands.map((command) => {
        const active = running.find((session) => session.command?.id === command.id);
        return <DropdownMenuItem key={command.id} disabled={disabled} title={t(active ? "tasks:commands.stop" : "tasks:commands.run", { name: command.name })}
          onSelect={() => { if (active) void useTaskSessionStore.getState().stop(active.id);else onRun(resource.resourceId, command.id); }}>
          {active?.status === "starting" ? <LoaderCircle className="size-3.5 animate-spin" /> : active ? <Square className="size-3.5" /> : <Play className="size-3.5" />}<span className="truncate">{command.name}</span>
        </DropdownMenuItem>;
      })}
      {error !== null && <DropdownMenuItem onSelect={() => void useResourceStore.getState().refresh()}>{t("common:actions.retry")}</DropdownMenuItem>}
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={!repository || disabled} onSelect={() => setManaging(true)}><Settings2 className="size-3.5" />{t("tasks:commands.manage")}</DropdownMenuItem>
    </DropdownMenuContent></DropdownMenu>
    </ButtonGroup>}
    {managing && repository && <ResourceDialog record={repository} repositoriesDirectory={repositoriesDirectory} onClose={() => setManaging(false)} onReturnFocus={() => trigger.current?.focus()} />}
  </>;
}
