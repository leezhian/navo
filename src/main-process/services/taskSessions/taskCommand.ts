import { realpath } from "node:fs/promises";
import type { Task } from "../../../domain/tasks";
import type { ResourceRecord } from "../../../shared/settingsTypes";
import type { StartTaskSessionInput } from "../../../shared/taskSessionTypes";

/** 只执行用户保存的仓库命令；禁止渲染进程提交脚本或借其他仓库的 ID 执行。 */
export async function resolveTaskCommand(task: Task, input: StartTaskSessionInput, records: ResourceRecord[]) {
  if (input.kind !== "shell" || typeof input.commandId !== "string" || !input.commandId || typeof input.resourceId !== "string" || input.agent || input.agentId) throw new Error("TASK_INVALID");
  if (task.status === "ARCHIVED") throw new Error("SESSION_COMMAND_UNAVAILABLE");
  const workspace = task.resources?.find((item) => item.resourceId === input.resourceId && item.mode !== "folder");
  const record = workspace && records.find((item) => item.id === (workspace.repositoryId ?? workspace.resourceId));
  const command = record?.commands?.find((item) => item.id === input.commandId);
  if (!workspace || !record?.available || !command || !command.script.trim() || command.script.includes("\0")) throw new Error("SESSION_COMMAND_UNAVAILABLE");
  if (await realpath(record.localPath) !== await realpath(workspace.originalPath)) throw new Error("SESSION_COMMAND_UNAVAILABLE");
  return command;
}

export function taskCommandArguments(script: string, platform = process.platform) {
  if (platform === "win32") throw new Error("SESSION_COMMAND_UNSUPPORTED");
  return ["-l", "-c", script];
}
