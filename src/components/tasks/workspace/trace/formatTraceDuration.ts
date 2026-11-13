/** 轨迹时长：最大单位为天，用 d h m s 显示；不足一分钟仍保留一位小数秒。 */
export function formatTraceDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const seconds = ms / 1000;
  if (seconds < 60) {
    const rounded = Math.round(seconds * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}s`;
  }
  let remaining = Math.round(seconds);
  const days = Math.floor(remaining / 86400);
  remaining %= 86400;
  const hours = Math.floor(remaining / 3600);
  remaining %= 3600;
  const minutes = Math.floor(remaining / 60);
  const rest = remaining % 60;
  return [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
    rest || (!days && !hours && !minutes) ? `${rest}s` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function formatTraceClock(date: Date) {
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/**
 * 时间线方块悬停只保留三行：类型、本地时刻、总毫秒。
 * 有耗时时写出开始到结束；没有耗时时不补 0，第三行交给调用方的「未记录」。
 */
export function timelineHoverText(
  event: { timestamp?: string; durationMs?: number },
  kind: string,
  missing: string,
  total: (ms: number) => string,
): string {
  const start = event.timestamp ? Date.parse(event.timestamp) : Number.NaN;
  const clock = Number.isFinite(start) ? formatTraceClock(new Date(start)) : (event.timestamp ?? missing);
  const duration = event.durationMs;
  const spentMs = duration != null && Number.isFinite(duration) ? Math.max(0, duration) : null;
  const time = spentMs != null && Number.isFinite(start) ? `${clock} → ${formatTraceClock(new Date(start + spentMs))}` : clock;
  const spent = spentMs != null && Number.isFinite(start) ? total(spentMs) : missing;
  return `${kind}\n${time}\n${spent}`;
}
