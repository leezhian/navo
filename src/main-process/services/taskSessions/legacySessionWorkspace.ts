import { realpath } from "node:fs/promises";
import path from "node:path";
import type { Task } from "../../../domain/tasks";
import type { TaskSessionWorkspace } from "../../../shared/taskSessionTypes";
import { resolveSessionWorkspace } from "../../../utils/taskSessionWorkspace";
import { resolveResourcePath } from "../resourcePaths";

/** 旧记录只按真实路径恢复范围；目录已删除或设置已变化时保留未知状态。 */
export async function readLegacySessionWorkspace(task: Task, cwd: string, tasksDirectory: string): Promise<TaskSessionWorkspace | undefined> {
  if (!cwd || !/^[a-zA-Z0-9_-]{1,128}$/.test(task.id)) return;
  let actual: string;
  try { actual = await realpath(cwd); } catch { return; }
  try {
    const root = await realpath(resolveResourcePath(tasksDirectory));
    if (actual === path.join(root, task.id)) return { kind: "all" };
  } catch { /* 原有任务根目录不存在时，仍可识别绑定的仓库目录。 */ }
  for (const resource of task.resources ?? []) {
    try {
      if (actual === await realpath(resource.workingPath)) return resolveSessionWorkspace(task.resources ?? [], resource.resourceId);
    } catch { /* 不存在的其他资源不影响当前会话识别。 */ }
  }
}
