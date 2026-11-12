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
