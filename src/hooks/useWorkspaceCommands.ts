import { resourceApi } from "@/services/resourceApi";
import { useEffect, useState } from "react";
import type { TaskResource } from "@/shared/taskTypes";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { useResourceStore } from "@/stores/resourceStore";
import { useTaskSessionStore, workspaceCommandKey } from "@/stores/taskSessionStore";

/** 两个命令入口使用同一列表，已删除配置但仍在运行的命令保留停止入口。 */
export function useWorkspaceCommands(taskId: string, resource: TaskResource, sessions: TaskSession[], onRun: (resourceId: string, commandId: string) => void) {
  const records = useResourceStore((state) => state.records);
  const error = useResourceStore((state) => state.error);
  const workspaceKey = workspaceCommandKey(taskId, resource.resourceId);
  const commandRuns = useTaskSessionStore((state) => state.commandRuns.get(workspaceKey));
  const repository = records.find((record) => record.id === (resource.repositoryId ?? resource.resourceId));
  const commands = repository?.commands ?? [];
  const running = sessions.filter((session) => session.command?.resourceId === resource.resourceId && ["starting", "running"].includes(session.status));
  const active = running[running.length - 1];
  const runningByCommand = new Map(running.map((session) => [session.command?.id, session]));
  const recentCommand = commands.reduce<(typeof commands)[number] | undefined>((latest, command) => {
    const runAt = commandRuns?.get(command.id);
    return runAt !== undefined && runAt > (commandRuns?.get(latest?.id ?? "") ?? -Infinity) ? command : latest;
  }, undefined);
  const defaultCommand = commands.find((command) => command.id === repository?.defaultCommandId);
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultFailed, setDefaultFailed] = useState(false);
  const preferred = defaultCommand ?? recentCommand ?? commands[0];
  const menuCommands = [
    ...commands.map(({ id, name }) => ({ id, name, activeStatus: runningByCommand.get(id)?.status, pinned: id === defaultCommand?.id, canPin: true })),
    ...running.flatMap(({ command, status }) => command && !commands.some(({ id }) => id === command.id)
      ? [{ id: command.id, name: command.name, activeStatus: status, pinned: false, canPin: false }] : []),
  ];
  useEffect(() => {
    const resources = useResourceStore.getState();
    if (!resources.loaded) void resources.refresh();
  }, []);
  function select(commandId: string) {
    const session = runningByCommand.get(commandId);
    if (session) void useTaskSessionStore.getState().stop(session.id);
    else onRun(resource.resourceId, commandId);
  }
  async function pin(commandId: string | null) {
    if (!repository || savingDefault) return;
    setDefaultFailed(false);
    setSavingDefault(true);
    try {
      const saved = await resourceApi.setDefaultCommand(repository.id, commandId);
      const store = useResourceStore.getState();
      const current = store.records.find((record) => record.id === saved.id);
      if (current) store.upsert({ ...current, defaultCommandId: saved.defaultCommandId });
    } catch { setDefaultFailed(true); }
    finally { setSavingDefault(false); }
  }
  return { repository, error, active, preferred, menuCommands, select, savingDefault, defaultFailed, pin };
}
