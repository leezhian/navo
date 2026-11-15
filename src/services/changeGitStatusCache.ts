import type { ChangeGitStatus } from "@/shared/changeGitStatus";
import { CHANGE_GIT_CACHE_MS } from "@/shared/changeGitStatus";
import { getTasksApi } from "./taskApi";

interface CachedChangeGitStatus {
  status: ChangeGitStatus;
  cachedAt: number;
}

const cache = new Map<string, CachedChangeGitStatus>();
const pending = new Map<string, Promise<ChangeGitStatus>>();

export function changeGitStatusKey(taskId: string, resourceId: string, workingPath: string) {
  return taskId + "\0" + resourceId + "\0" + workingPath;
}

export function getCachedChangeGitStatus(taskId: string, resourceId: string, workingPath: string, allowStale = false) {
  const entry = cache.get(changeGitStatusKey(taskId, resourceId, workingPath));
  if (!entry) return null;
  if (!allowStale && Date.now() - entry.cachedAt > CHANGE_GIT_CACHE_MS) return null;
  return entry.status;
}

/** 悬停读取；30 秒内复用上次结果，失败仍保留已有快照。 */
export function loadChangeGitStatus(taskId: string, resourceId: string, workingPath: string, forceRefresh = false): Promise<ChangeGitStatus> {
  const key = changeGitStatusKey(taskId, resourceId, workingPath);
  if (!forceRefresh) {
    const fresh = getCachedChangeGitStatus(taskId, resourceId, workingPath);
    if (fresh) return Promise.resolve(fresh);
  }
  const existing = pending.get(key);
  if (existing) return existing;
  const request = getTasksApi().inspectChangeGitStatus(taskId, resourceId).then((status) => {
    if (status.failed) {
      const previous = cache.get(key);
      if (previous && !previous.status.failed) return previous.status;
    }
    cache.set(key, { status, cachedAt: Date.now() });
    return status;
  }).finally(() => {
    if (pending.get(key) === request) pending.delete(key);
  });
  pending.set(key, request);
  return request;
}

export function rememberChangeGitStatus(taskId: string, resourceId: string, workingPath: string, status: ChangeGitStatus) {
  const key = changeGitStatusKey(taskId, resourceId, workingPath);
  if (status.failed) {
    const previous = cache.get(key);
    if (previous && !previous.status.failed) return;
  }
  cache.set(key, { status, cachedAt: Date.now() });
}

/** 保留已有快照但视为过期，便于测试在失败后重新读取。 */
export function expireChangeGitStatusCache() {
  for (const entry of cache.values()) entry.cachedAt = 0;
}

export function clearChangeGitStatusCache() {
  cache.clear();
  pending.clear();
}
