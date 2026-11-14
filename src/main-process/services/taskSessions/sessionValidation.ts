import type { TaskSession, TaskSessionWorkspace } from "../../../shared/taskSessionTypes";
import { isTaskAgentSelection } from "../../../utils/taskAgentSelection";

const SESSION_STATUSES = new Set(["starting", "running", "stopped", "failed"]);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isDate = (value: unknown): value is string => isText(value) && Number.isFinite(Date.parse(value));

function isWorkspace(value: unknown): value is TaskSessionWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<TaskSessionWorkspace>;
  return workspace.kind === "all" || (workspace.kind === "resource" && isText(workspace.resourceId)
    && typeof workspace.name === "string" && typeof workspace.branch === "string");
}

/** SQLite 的主键/外键是身份依据；不信任 JSON 内的 ID，也不把坏字段默认成可运行状态。 */
export function parseStoredSession(data: string, id: string, taskId: string): TaskSession | null {
  let value: unknown;
  try { value = JSON.parse(data); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const session = value as Partial<TaskSession>;
  if (!isText(session.id) || session.id !== id || !isText(session.taskId) || session.taskId !== taskId
    || session.kind !== "agent" || !isTaskAgentSelection(session.agent)
    || !SESSION_STATUSES.has(session.status ?? "") || typeof session.title !== "string"
    || typeof session.cwd !== "string" || !isText(session.terminalId) || typeof session.resumable !== "boolean"
    || !isDate(session.createdAt)
    || (session.titleSource !== undefined && session.titleSource !== "cli")
    || (session.contextMode !== undefined && !["dynamic", "file", "snapshot"].includes(session.contextMode))
    || (session.contextSyncFailed !== undefined && typeof session.contextSyncFailed !== "boolean")
    || (session.resumeOnOpen !== undefined && typeof session.resumeOnOpen !== "boolean")
    || (session.workspace !== undefined && !isWorkspace(session.workspace))
    || [session.archivedAt, session.lastUpdateAt, session.lastActiveAt, session.lastReplyAt, session.lastPromptAt, session.nativeLaunchAt].some((date) => date !== undefined && !isDate(date))
    || [session.nativeSessionId, session.nativeLaunchId, session.nativeHistoryRoot, session.error].some((text) => text !== undefined && !isText(text))) return null;
  // 兼容没有活动时间的旧记录，仅使用已知时间回填，不制造新活动。
  const stored = { ...session };
  delete stored.phase; delete stored.waitingReason; delete stored.usage;
  return { ...stored, lastUpdateAt: session.lastUpdateAt ?? session.archivedAt ?? session.createdAt,
    lastActiveAt: session.lastActiveAt ?? session.createdAt } as TaskSession;
}
