import { realpath, stat } from "node:fs/promises";
import type { Task } from "../../../domain/tasks";
import type { TaskSession } from "../../../shared/taskSessionTypes";
import { resolveSessionWorkspace } from "../../../utils/taskSessionWorkspace";

/** 来源 ID 已由会话服务校验窗口归属；只复用目录，不传递原生会话 ID 或旧配置。 */
export async function sessionFromSource(task: Task, source: TaskSession) {
  if (source.taskId !== task.id || source.kind !== "agent") throw new Error("SESSION_UNAVAILABLE");
  if (!source.workspace || !source.cwd) throw new Error("SESSION_DIRECTORY_MISSING");
  const resources = task.resources ?? [];
  const resourceId = source.workspace.kind === "resource" ? source.workspace.resourceId : null;
  const workspace = resolveSessionWorkspace(resources, resourceId);
  try {
    const cwd = await realpath(source.cwd);
    if (!(await stat(cwd)).isDirectory()) throw new Error("SESSION_DIRECTORY_MISSING");
    const resource = resources.find((item) => item.resourceId === resourceId);
    if (resource && await realpath(resource.workingPath) !== cwd) throw new Error("SESSION_DIRECTORY_MISSING");
    // 全任务会话保留原 cwd，不因默认任务目录设置变化而跳到新目录。
    return { cwd, workspace };
  } catch { throw new Error("SESSION_DIRECTORY_MISSING"); }
}
