import type { TaskSession } from "@/shared/taskSessionTypes";

const MARKS_KEY = "navo:session-read-marks";
const BASELINE_KEY = "navo:session-read-baseline";
const UNREAD_KEY = "navo:session-manual-unread";

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

function readManualUnread(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(UNREAD_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}

export function isSessionManuallyUnread(sessionId: string) {
  return readManualUnread().includes(sessionId);
}

/** 手动未读独立于回复水位，因此没有回复的会话也可留待稍后处理。 */
export function markSessionUnread(sessionId: string) {
  if (!sessionId || isSessionManuallyUnread(sessionId)) return;
  writeManualUnread([...readManualUnread(), sessionId]);
}

function writeManualUnread(ids: string[]) {
  try { localStorage.setItem(UNREAD_KEY, JSON.stringify(ids)); }
  catch { /* 与已读水位一样，存储不可用时不阻断界面。 */ }
  notify();
}

/** 将水位推进到 at；只前进，不回退。 */
export function markSessionRead(sessionId: string, at = new Date().toISOString()) {
  if (!sessionId || !Number.isFinite(Date.parse(at))) return;
  if (isSessionManuallyUnread(sessionId)) writeManualUnread(readManualUnread().filter((id) => id !== sessionId));
  const marks = readMarks();
  const previous = marks[sessionId];
  if (previous && Date.parse(previous) >= Date.parse(at)) return;
  marks[sessionId] = at;
  writeMarks(marks);
}

/** 手动标记或回复晚于本机水位时算未读；普通终端与已归档会话始终排除。 */
export function isSessionUnread(session: Pick<TaskSession, "lastReplyAt" | "id" | "kind" | "archivedAt">) {
  if (session.kind !== "agent" || session.archivedAt) return false;
  if (isSessionManuallyUnread(session.id)) return true;
  if (!session.lastReplyAt) return false;
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
