import { useTranslation } from "react-i18next";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import type { TaskNote } from "@/shared/taskResourceTypes";
import { TaskTime } from "../TaskTime";

interface TaskNoteProvenanceProps {
  /** 原创建来源与最后编辑来源分别展示；不把创建者误认为所有版本的作者。 */
  note: TaskNote;
  /** 来源会话仍在当前任务中时可定位它，不自动发送消息。 */
  onSession?: (id: string) => void;
}
export function TaskNoteProvenance({ note, onSession }: TaskNoteProvenanceProps) {
  const { t } = useTranslation(["tasks"]);
  const sessions = useTaskSessionStore((state) => state.sessions);
  function actor(origin: string, sessionId?: string) {
    const session = sessions.find((item) => item.id === sessionId);
    const label = origin === "user" ? t("tasks:notes.authorYou") : origin === "agent" ? session?.title || t("tasks:notes.authorAgent") : t("tasks:notes.authorUnknown");
    return session && !session.archivedAt && onSession ? <button className="max-w-40 truncate underline underline-offset-2" onClick={() => onSession(session.id)}>{label}</button> : <span className="max-w-40 truncate">{label}</span>;
  }
  return <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
    <span className="inline-flex max-w-full items-center gap-1"><span>{t("tasks:notes.created")}</span><TaskTime value={note.createdAt} />{actor(note.origin, note.sessionId)}</span>
    {note.version > 1 && <span className="inline-flex max-w-full items-center gap-1"><span>{t("tasks:notes.edited")}</span><TaskTime value={note.updatedAt} />{actor(note.lastEditor ?? "unknown", note.lastEditorSessionId)}</span>}
  </div>;
}
