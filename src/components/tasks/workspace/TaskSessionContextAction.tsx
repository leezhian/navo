import { useEffect, useState } from "react";
import { BookOpen, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskSession } from "@/shared/taskSessionTypes";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { getTaskSessionsApi } from "@/services/taskSessionApi";

interface TaskSessionContextActionProps {
  /** 显示真实接入方式，文件已同步不等于模型已读取。 */
  session: TaskSession;
  /** 归档任务禁止刷新/复制上下文读取提示。 */
  archived: boolean;
}
export function TaskSessionContextAction({ session, archived }: TaskSessionContextActionProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const [feedback, setFeedback] = useState<"copied" | "failed" | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);
  if (!session.contextMode) return null;
  const file = session.contextMode === "file";
  const label = feedback === "copied" ? t("tasks:context.reminderCopied") : feedback === "failed" ? t("tasks:context.reminderFailed")
    : file ? t(session.contextSyncFailed ? "tasks:context.fileFailed" : "tasks:context.file")
    : t(session.contextMode === "dynamic" ? "tasks:context.dynamic" : "tasks:context.snapshot");
  async function copyReminder() {
    if (!file || busy || archived || session.status !== "running") return;
    setBusy(true); setFeedback(null);
    try {
      const text = await getTaskSessionsApi().contextReminder(session.id);
      await navigator.clipboard.writeText(text);
      setFeedback("copied");
    } catch { setFeedback("failed"); }
    finally { setBusy(false); }
  }
  return <IconTooltip label={label} size="icon-xs" disabled={file && (busy || archived || session.status !== "running")}
    className={session.contextSyncFailed || feedback === "failed" ? "text-destructive" : undefined} onClick={file ? () => void copyReminder() : undefined}>
    {feedback === "copied" ? <Check /> : <BookOpen />}
  </IconTooltip>;
}
