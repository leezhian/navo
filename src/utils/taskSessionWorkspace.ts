import type { TaskResource } from "../shared/taskTypes";
import type { TaskSession, TaskSessionWorkspace } from "../shared/taskSessionTypes";

/** 在创建边界固定范围，拒绝外来 ID；null 不随资源数量变化而退回单目录。 */
export function resolveSessionWorkspace(resources: TaskResource[], resourceId?: string | null): TaskSessionWorkspace {
  if (resourceId !== undefined && resourceId !== null && (typeof resourceId !== "string" || !resourceId)) throw new Error("SESSION_DIRECTORY_MISSING");
  const selected = typeof resourceId === "string" ? resources.find((resource) => resource.resourceId === resourceId)
    : resourceId === undefined && resources.length === 1 ? resources[0] : undefined;
  if (typeof resourceId === "string" && !selected) throw new Error("SESSION_DIRECTORY_MISSING");
  return selected ? { kind: "resource", resourceId: selected.resourceId, name: selected.name, branch: selected.targetBranch || selected.sourceBranch }
    : { kind: "all" };
}

/** 旧会话仅按精确目录匹配；无法确认的旧记录显示目录，不冒充全局范围。 */
export function sessionWorkspaceLabel(session: TaskSession, resources: TaskResource[], allLabel: string, unknownLabel: string) {
  if (session.workspace?.kind === "all") return allLabel;
  const normalize = (value: string) => value.replace(/[\\/]+$/, "");
  const workspace = session.workspace;
  const resource = workspace?.kind === "resource"
    ? resources.find((item) => item.resourceId === workspace.resourceId)
    : resources.find((item) => session.cwd && normalize(item.workingPath) === normalize(session.cwd));
  if (resource) return resource.mode === "folder" ? resource.name : resource.targetBranch || resource.sourceBranch || resource.name;
  if (session.workspace?.kind === "resource") return session.workspace.branch || session.workspace.name;
  const parts = session.cwd.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || unknownLabel;
}
