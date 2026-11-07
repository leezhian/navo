import type { TaskSession } from "@/shared/taskSessionTypes";

const MARKS_KEY = "navo:session-read-marks";
const BASELINE_KEY = "navo:session-read-baseline";

let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

function readMarks(): Record<string, string> {
  try {
    const raw = localStorage.getItem(MARKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const marks: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && Number.isFinite(Date.parse(value))) marks[id] = value;
    }
    return marks;
  } catch { return {}; }
}

function writeMarks(marks: Record<string, string>) {
  try { localStorage.setItem(MARKS_KEY, JSON.stringify(marks)); }
  catch { /* 私密模式或配额满时忽略，不阻断会话交互。 */ }
  notify();
}

/** 首次启用未读时写入全局水位，避免历史会话全部被标为未读。 */
export function ensureReadBaseline(now = new Date().toISOString()) {
  try {
    const existing = localStorage.getItem(BASELINE_KEY);
    if (existing && Number.isFinite(Date.parse(existing))) return existing;
    localStorage.setItem(BASELINE_KEY, now);
    notify();
    return now;
  } catch { return now; }
}

export function readSessionMark(sessionId: string) {
  return readMarks()[sessionId];
}

/** 将水位推进到 at；只前进，不回退。 */
export function markSessionRead(sessionId: string, at = new Date().toISOString()) {
  if (!sessionId || !Number.isFinite(Date.parse(at))) return;
  const marks = readMarks();
  const previous = marks[sessionId];
  if (previous && Date.parse(previous) >= Date.parse(at)) return;
  marks[sessionId] = at;
  writeMarks(marks);
}

/** 仅当会话有 lastReplyAt，且晚于本机会话水位（无水位时用全局基线）时才算未读。 */
export function isSessionUnread(session: Pick<TaskSession, "lastReplyAt" | "id" | "kind" | "archivedAt">) {
  if (session.kind !== "agent" || session.archivedAt || !session.lastReplyAt) return false;
  const watermark = readSessionMark(session.id) ?? ensureReadBaseline();
  return Date.parse(session.lastReplyAt) > Date.parse(watermark);
}

export function subscribeReadMarks(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getReadMarksVersion() {
  return version;
}
