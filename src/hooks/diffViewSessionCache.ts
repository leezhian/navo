import type { CompareMode, ReviewSummary } from "@/domain/types";

interface DiffViewSessionSnapshot {
  /** 最近一次成功加载的 diff 汇总。 */
  summary: ReviewSummary;
  /** 与 summary 对应的对比方式。 */
  mode: CompareMode;
  /** diff 内容签名。 */
  signature: string;
}

/** 模块级 diff 快照缓存：HMR / 短暂卸载后仍可恢复，避免白屏。 */
const snapshots = new Map<string, DiffViewSessionSnapshot>();

/** 滚动位置单独存储，避免在尚无 snapshot 时写入空 summary。 */
const scrollTops = new Map<string, number>();

export function getDiffViewCacheKey(sessionId: string, mode: CompareMode, targetBranch: string) {
  return `${sessionId}:${mode}:${targetBranch}`;
}

export function readDiffViewSnapshot(cacheKey: string) {
  return snapshots.get(cacheKey) ?? null;
}

export function writeDiffViewSnapshot(
  cacheKey: string,
  snapshot: DiffViewSessionSnapshot,
) {
  snapshots.set(cacheKey, snapshot);
}

export function writeDiffViewScrollTop(cacheKey: string, scrollTop: number) {
  scrollTops.set(cacheKey, scrollTop);
}

export function readDiffViewScrollTop(cacheKey: string) {
  return scrollTops.get(cacheKey) ?? 0;
}
