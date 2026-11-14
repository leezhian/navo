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

export interface SessionHoverPlace {
  project: string;
  branch: string;
  path: string;
}

function trimPath(value: string) {
  return value.replace(/[\\/]+$/, "");
}

function pathTail(cwd: string) {
  return cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
}

/** 资源会话按 ID 找；旧记录只按去掉尾部分隔符的目录精确匹配。 */
function linkedResource(session: TaskSession, resources: TaskResource[]) {
  const workspace = session.workspace;
  if (workspace?.kind === "resource") return resources.find((item) => item.resourceId === workspace.resourceId);
  return resources.find((item) => session.cwd && trimPath(item.workingPath) === trimPath(session.cwd));
}

/** 全部工作树和文件夹的会话不展示项目、分支和路径。没有分支的普通文件夹只保留项目和路径。 */
export function sessionHoverPlace(session: TaskSession, resources: TaskResource[]): SessionHoverPlace | null {
  if (session.workspace?.kind === "all") return null;
  const resource = linkedResource(session, resources);
  if (resource) {
    return {
      project: resource.name,
      branch: resource.mode === "folder" ? "" : resource.targetBranch || resource.sourceBranch,
      path: resource.workingPath || session.cwd,
    };
  }
  if (session.workspace?.kind === "resource") return { project: session.workspace.name, branch: session.workspace.branch, path: session.cwd };
  return { project: pathTail(session.cwd), branch: "", path: session.cwd };
}

/** 路径过长时保留末尾，方便辨认 worktree 或项目目录。 */
export function shortenPath(value: string, max = 42) {
  const normalized = value.replace(/\\/g, "/");
  if (normalized.length <= max) return normalized;
  return `…${normalized.slice(-(max - 1))}`;
}

/** 旧会话仅按精确目录匹配；无法确认的旧记录显示目录，不冒充全局范围。 */
export function sessionWorkspaceLabel(session: TaskSession, resources: TaskResource[], allLabel: string, unknownLabel: string) {
  if (session.workspace?.kind === "all") return allLabel;
  const resource = linkedResource(session, resources);
  if (resource) return resource.mode === "folder" ? resource.name : resource.targetBranch || resource.sourceBranch || resource.name;
  if (session.workspace?.kind === "resource") return session.workspace.branch || session.workspace.name;
  return pathTail(session.cwd) || unknownLabel;
}
