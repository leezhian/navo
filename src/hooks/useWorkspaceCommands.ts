import { useEffect } from "react";
import type { TaskResource } from "@/shared/taskTypes";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { useResourceStore } from "@/stores/resourceStore";
import { useTaskSessionStore } from "@/stores/taskSessionStore";

/** 两个命令入口使用同一列表，已删除配置但仍在运行的命令保留停止入口。 */
export function useWorkspaceCommands(resource: TaskResource, sessions: TaskSession[], onRun: (resourceId: string, commandId: string) => void) {
  const records = useResourceStore((state) => state.records);
  const error = useResourceStore((state) => state.error);
  const repository = records.find((record) => record.id === (resource.repositoryId ?? resource.resourceId));
  const commands = repository?.commands ?? [];
  const commandSessions = sessions.filter((session) => session.command?.resourceId === resource.resourceId);
  const running = commandSessions.filter((session) => ["starting", "running"].includes(session.status));
  const active = running[running.length - 1];
  const lastCommand = commandSessions[commandSessions.length - 1]?.command;
  const preferred = commands.find((command) => command.id === lastCommand?.id) ?? commands[0];
  const menuCommands = [...commands, ...running.flatMap((session) => session.command && !commands.some((command) => command.id === session.command?.id) ? [session.command] : [])];
  useEffect(() => {
    const resources = useResourceStore.getState();
    if (!resources.loaded) void resources.refresh();
  }, []);
  function select(commandId: string) {
    const session = running.find((item) => item.command?.id === commandId);
    if (session) void useTaskSessionStore.getState().stop(session.id);
    else onRun(resource.resourceId, commandId);
  }
  return { repository, error, running, active, preferred, menuCommands, select };
}
