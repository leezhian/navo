import type { SessionUsage } from "@/shared/taskSessionTypes";

/** 上下文占用用最近一轮的输入、输出和缓存之和；超过窗口或缺少窗口时不显示百分比。 */
export function sessionContextPercent(usage: SessionUsage | undefined) {
  if (!usage?.contextWindow) return undefined;
  const parts = [usage.inputTokens, usage.outputTokens, usage.cachedTokens].filter((value): value is number => value !== undefined);
  if (!parts.length) return undefined;
  const occupied = parts.reduce((sum, value) => sum + value, 0);
  if (occupied > usage.contextWindow) return undefined;
  return Math.round((occupied / usage.contextWindow) * 100);
}