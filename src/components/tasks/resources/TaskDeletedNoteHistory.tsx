import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, RotateCcw } from "lucide-react";
import type { TaskNote } from "@/shared/taskResourceTypes";
import type { TaskNoteVersion } from "@/shared/taskNoteTypes";
import { getTasksApi } from "@/services/taskApi";
import { getTaskError } from "@/services/taskErrors";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskNoteMarkdown } from "../workspace/TaskNoteMarkdown";

interface TaskDeletedNoteHistoryProps {
  /** 只读展示回收笔记的真实历史，不通过普通编辑器修改回收内容。 */
  taskId: string;
  note: TaskNote;
  readOnly: boolean;
  busy: boolean;
  onBack: () => void;
  /** 恢复所查看的历史版本，保留笔记 ID 和其余历史、评论。 */
  onRestore: (version: number) => void;
}

export function TaskDeletedNoteHistory({ taskId, note, readOnly, busy, onBack, onRestore }: TaskDeletedNoteHistoryProps) {
  const { t, i18n } = useTranslation(["tasks", "common"]);
  const [versions, setVersions] = useState<TaskNoteVersion[]>([]);
  const [selected, setSelected] = useState<number>(note.version);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    void getTasksApi().noteHistory(taskId, note.id).then((items) => {
      if (!cancelled) setVersions(items);
    }).catch((failure) => { if (!cancelled) setError(failure); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId, note.id, revision]);
  const snapshot = versions.find((version) => version.version === selected);
  return <section className="flex min-h-0 flex-col gap-3" data-deleted-note-history>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft />{t("common:actions.back")}</Button>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{note.title || t("tasks:resources.untitledNote")}</span>
      {!readOnly && <Button variant="secondary" size="sm" disabled={busy || loading || !snapshot || error !== null} onClick={() => onRestore(selected)}><RotateCcw />{t("tasks:resources.deleted.restoreVersion")}</Button>}
    </div>
    {error !== null && <div role="alert" className="text-xs text-destructive">{getTaskError(error)}<Button variant="ghost" size="sm" onClick={() => setRevision((value) => value + 1)}>{t("common:actions.retry")}</Button></div>}
    {loading ? <p role="status" className="text-xs text-muted-foreground">{t("common:status.loading")}</p> : <>
      <Select value={String(selected)} onValueChange={(value) => setSelected(Number(value))} disabled={!versions.length}>
        <SelectTrigger size="sm" aria-label={t("tasks:notes.history.title")}><SelectValue /></SelectTrigger>
        <SelectContent>{versions.map((version) => <SelectItem key={version.version} value={String(version.version)}>v{version.version} · {new Date(version.createdAt).toLocaleString(i18n.language)}</SelectItem>)}</SelectContent>
      </Select>
      {snapshot ? <>
        <p className="text-xs text-muted-foreground">{t(snapshot.actor === "agent" ? "tasks:notes.authorAgent" : snapshot.actor === "user" ? "tasks:notes.authorYou" : "tasks:notes.authorUnknown")} · {snapshot.title || t("tasks:resources.untitledNote")}</p>
        <div className="rounded-lg border p-3" data-deleted-note-content><TaskNoteMarkdown content={snapshot.content} /></div>
      </> : <p className="text-xs text-muted-foreground">{t("tasks:notes.history.empty")}</p>}
    </>}
  </section>;
}
