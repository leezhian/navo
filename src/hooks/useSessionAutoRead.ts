import { useEffect, useRef } from "react";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { isSessionManuallyUnread } from "@/utils/sessionReadMarks";
import { useSessionUnread } from "./useSessionUnread";

/** 重新进入会话时确认已读；停留期间保留手动未读，不被运行状态刷新或新回复抵消。 */
export function useSessionAutoRead(session: TaskSession | undefined, visible: boolean) {
  const { markRead } = useSessionUnread();
  const viewedId = useRef<string | undefined>(undefined);
  const id = session?.id;
  const lastReplyAt = session?.lastReplyAt;
  useEffect(() => {
    if (!visible || !id) { viewedId.current = undefined; return; }
    const entering = viewedId.current !== id;
    viewedId.current = id;
    if (entering || !isSessionManuallyUnread(id)) markRead({ id, lastReplyAt });
  }, [id, lastReplyAt, visible, markRead]);
}
