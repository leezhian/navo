import type { WorkspaceOpenOptions } from "@/shared/workspaceOpenTypes";
import { getTasksApi } from "./taskApi";

export const WORKSPACE_OPTIONS_CACHE_MS = 5 * 60 * 1000;
export const WORKSPACE_OPTIONS_RETRY_MS = 60 * 1000;
const CACHE_LIMIT = 100;
interface CachedOptions {
  value: WorkspaceOpenOptions | null;
  refreshAfter: number;
  pending: Promise<WorkspaceOpenOptions | null> | null;
}
const cache = new Map<string, CachedOptions>();

export function workspaceOptionsKey(taskId: string, resourceId: string, workingPath: string) {
  return JSON.stringify([taskId, resourceId, workingPath]);
}
export function cachedWorkspaceOptions(key: string) { return cache.get(key)?.value ?? null; }
export function invalidateWorkspaceOptions(key: string) {
  const entry = cache.get(key);
  if (entry) entry.refreshAfter = 0;
}

/** 多个任务视图共享请求和结果；失败保留旧菜单，避免切页或前台事件形成重试风暴。 */
export function loadWorkspaceOptions(key: string, taskId: string, resourceId: string): Promise<WorkspaceOpenOptions | null> {
  const entry = cache.get(key) ?? { value: null, refreshAfter: 0, pending: null };
  cache.delete(key);cache.set(key, entry);
  if (entry.pending) return entry.pending;
  if (Date.now() < entry.refreshAfter) return Promise.resolve(entry.value);
  entry.pending = Promise.resolve().then(() => getTasksApi().workspaceOpenOptions(taskId, resourceId)).then((value) => {
    entry.value = value;entry.refreshAfter = Date.now() + WORKSPACE_OPTIONS_CACHE_MS;return value;
  }).catch(() => {
    entry.refreshAfter = Date.now() + WORKSPACE_OPTIONS_RETRY_MS;return entry.value;
  }).finally(() => { entry.pending = null; });
  if (cache.size > CACHE_LIMIT) {
    const oldest = [...cache].find(([, item]) => !item.pending)?.[0];
    if (oldest !== undefined) cache.delete(oldest);
  }
  return entry.pending;
}
