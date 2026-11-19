import type { SessionUsage } from "@/shared/taskSessionTypes";

/** 只使用采集层确认的当前上下文，避免重复计入缓存或将整轮累计量当作占用。 */
export function sessionContextPercent(usage: SessionUsage | undefined) {
  const occupied = usage?.contextTokens, window = usage?.contextWindow;
  if (occupied === undefined || window === undefined || !Number.isSafeInteger(occupied) || !Number.isSafeInteger(window)
    || occupied < 0 || window <= 0 || occupied > window) return undefined;
  return Math.round((occupied / window) * 100);
}
