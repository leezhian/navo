import type { ResourceGitInfo } from "@/shared/settingsTypes";
import { resourceApi } from "./resourceApi";

const CACHE_LIMIT = 100;
const cache = new Map<string, ResourceGitInfo>();
const pending = new Map<string, { request: Promise<ResourceGitInfo>; forced: boolean }>();

export function getCachedResourceGitInfo(localPath: string) {
  return cache.get(localPath.trim()) ?? null;
}

/** 保留上次显示结果；主进程负责判断配置变化，渲染层只合并请求，不持久化缓存。 */
export function loadResourceGitInfo(localPath: string, forceRefresh = false): Promise<ResourceGitInfo> {
  const key = localPath.trim();
  const existing = pending.get(key);
  if (existing) {
    if (forceRefresh && !existing.forced) return existing.request.catch(() => undefined).then(() => loadResourceGitInfo(key, true));
    return existing.request;
  }
  const request = Promise.resolve().then(() => resourceApi.inspectGit(key, forceRefresh)).then((info) => {
    cache.delete(key);
    cache.set(key, info);
    const oldest = cache.keys().next().value;
    if (cache.size > CACHE_LIMIT && oldest !== undefined) cache.delete(oldest);
    return info;
  }).finally(() => {
    if (pending.get(key)?.request === request) pending.delete(key);
  });
  pending.set(key, { request, forced: forceRefresh });
  return request;
}

export async function refreshResourceGitInfoCache(localPaths: string[]) {
  const knownPaths = [...new Set(localPaths.map((localPath) => localPath.trim()))].filter((localPath) => cache.has(localPath) || pending.has(localPath));
  await Promise.allSettled(knownPaths.map((localPath) => loadResourceGitInfo(localPath, true)));
}
