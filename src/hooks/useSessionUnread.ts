import { useCallback, useSyncExternalStore } from "react";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { ensureReadBaseline, getReadMarksVersion, isSessionUnread, markSessionRead, markSessionUnread, subscribeReadMarks } from "@/utils/sessionReadMarks";

/** 订阅本机已读水位；首次调用时写入全局基线，避免历史会话全标未读。 */
export function useSessionUnread() {
  useSyncExternalStore(subscribeReadMarks, getReadMarksVersion, getReadMarksVersion);
  ensureReadBaseline();
  const unread = useCallback((session: Pick<TaskSession, "lastReplyAt" | "id" | "kind" | "archivedAt">) => isSessionUnread(session), []);
  const markRead = useCallback((session: Pick<TaskSession, "id" | "lastReplyAt">) => {
    const at = session.lastReplyAt && Date.parse(session.lastReplyAt) > Date.now()
      ? session.lastReplyAt : new Date().toISOString();
    markSessionRead(session.id, at);
  }, []);
  const markUnread = useCallback((sessionId: string) => markSessionUnread(sessionId), []);
  return { unread, markRead, markUnread };
}
