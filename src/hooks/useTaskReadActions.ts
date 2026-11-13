import type { TaskSession } from "@/shared/taskSessionTypes";
import { markSessionUnread } from "@/utils/sessionReadMarks";
import { useSessionUnread } from "./useSessionUnread";

/** 任务级菜单复用会话未读状态；标为未读只选最近活跃的一条，不改变进程状态。 */
export function useTaskReadActions(agents: TaskSession[]) {
  const { unread, markRead } = useSessionUnread();
  const unreadSessions = agents.filter(unread);
  const latest = agents.reduce<TaskSession | undefined>((selected, session) => {
    const time = (item: TaskSession) => Date.parse(item.lastActiveAt) || Date.parse(item.createdAt) || 0;
    return !selected || time(session) > time(selected) ? session : selected;
  }, undefined);
  return {
    available: agents.length > 0,
    hasUnread: unreadSessions.length > 0,
    toggleRead() {
      if (unreadSessions.length) unreadSessions.forEach(markRead);
      else if (latest) markSessionUnread(latest.id);
    },
  };
}
