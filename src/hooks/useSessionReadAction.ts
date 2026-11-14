import { CheckCheck, Mail, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { useSessionUnread } from "@/hooks/useSessionUnread";

/** 未读时标为已读，否则标为未读。下拉菜单和右键菜单共用这一处判断。 */
export function useSessionReadAction(session: Pick<TaskSession, "id" | "lastReplyAt" | "kind" | "archivedAt">) {
  const { t } = useTranslation(["tasks"]);
  const { unread, markRead, markUnread } = useSessionUnread();
  const hasUnread = !session.archivedAt && unread(session);
  const icon: LucideIcon = hasUnread ? CheckCheck : Mail;
  const label = t(hasUnread ? "tasks:runtime.markRead" : "tasks:runtime.markUnread");
  function run() {
    if (hasUnread) markRead(session);
    else markUnread(session.id);
  }
  return { icon, label, run };
}
