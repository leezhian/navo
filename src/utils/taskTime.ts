const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function parseTaskDate(value: string): Date {
  return new Date(value.length === 10 ? value + "T00:00:00" : value);
}

export function taskTimeLabel(value: string, now: number):
  | { kind: "relative"; unit: "justNow" | "minutes" | "hours" | "days"; count: number }
  | { kind: "absolute"; text: string } {
  const date = parseTaskDate(value);
  if (Number.isNaN(date.getTime())) return { kind: "absolute", text: value };
  const elapsed = Math.max(0, now - date.getTime());
  if (elapsed < MINUTE_MS) return { kind: "relative", unit: "justNow", count: 0 };
  if (elapsed < HOUR_MS) return { kind: "relative", unit: "minutes", count: Math.floor(elapsed / MINUTE_MS) };
  if (elapsed < DAY_MS) return { kind: "relative", unit: "hours", count: Math.floor(elapsed / HOUR_MS) };
  if (elapsed <= 30 * DAY_MS) return { kind: "relative", unit: "days", count: Math.floor(elapsed / DAY_MS) };
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return { kind: "absolute", text: `${date.getFullYear()}.${month}.${day}` };
}
