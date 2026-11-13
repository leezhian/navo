import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import path from "node:path";
import type { TaskResource } from "../../shared/taskTypes";
import type { WorkspaceStep } from "./taskWorkspaces";

/** 同一实际目录只绑定一次；仓库 ID 可以相同，工作区 ID 必须独立且稳定。 */
export async function assignWorkspaceIdentities(steps: WorkspaceStep[], existing: TaskResource[]) {
  const directory = (value: string) => realpath(value).catch(() => path.resolve(value));
  const storedPaths = await Promise.all(existing.map((resource) => directory(resource.workingPath)));
  const stepPaths = await Promise.all(steps.map((step) => directory(step.resource.workingPath)));
  const byDirectory = [...new Map(steps.map((step, index) => [stepPaths[index], step])).values()];
  const unique = [...new Map(byDirectory.map((step) => [step.resource.useExistingBranch ? `branch:${step.repository}:${step.resource.targetBranch}` : `directory:${step.resource.workingPath}`, step])).values()];
  const used = new Set(existing.map((resource) => resource.resourceId));
  for (const step of unique) {
    const current = existing[storedPaths.indexOf(await directory(step.resource.workingPath))];
    if (current) {
      if (step.reused || step.resource.mode === "folder" || step.resource.mode === "current-branch") { step.resource = current; step.reused = true; }
      else {
        if (current.ownership) throw new Error("TASK_RESOURCE_CHANGED");
        step.resource = { ...step.resource, resourceId: current.resourceId, repositoryId: current.repositoryId ?? current.resourceId };
      }
    } else {
      if (used.has(step.resource.resourceId)) step.resource.resourceId = randomUUID();
      used.add(step.resource.resourceId);
    }
  }
  return unique;
}
