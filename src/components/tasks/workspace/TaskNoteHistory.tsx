import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, Download, RotateCcw } from "lucide-react";
import { parseDiffFromFile } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { useTranslation } from "react-i18next";
import type { TaskNoteEditor } from "@/hooks/useTaskNoteEditor";
import type { TaskNoteVersion } from "@/shared/taskNoteTypes";
import { getTasksApi } from "@/services/taskApi";
import { getTaskError } from "@/services/taskErrors";
import { useTaskStore } from "@/stores/taskStore";
import { Button } from "@/components/ui/button";
import { TaskNoteMarkdown } from "./TaskNoteMarkdown";

interface TaskNoteHistoryProps {
  /** 当前笔记及草稿状态；有草稿时禁止恢复覆盖。 */
  editor: TaskNoteEditor;
  /** 返回当前笔记预览，不改变选中的笔记。 */
  onBack: () => void;
}
export default function TaskNoteHistory({ editor, onBack }: TaskNoteHistoryProps) {
  const { t, i18n } = useTranslation(["tasks", "common"]);
  const [versions, setVersions] = useState<TaskNoteVersion[]>([]);
  const [selected, setSelected] = useState<number>();
  const [baseline, setBaseline] = useState<number>();
  const [showDiff, setShowDiff] = useState(true), [loading, setLoading] = useState(true), [error, setError] = useState<unknown>(null);
  const note = editor.note;
  const loadedNote = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!note) return;
    let disposed = false; setLoading(true); setError(null);
    void getTasksApi().noteHistory(editor.taskId, note.id).then((records) => {
      if (!disposed) {
        const key = JSON.stringify([editor.taskId, note.id]);
        const changedNote = loadedNote.current !== key;
        loadedNote.current = key;
        setVersions(records);
        // 新版本到来时保留正在查看的历史范围，首次打开才默认比较最近两个版本。
        setSelected((value) => !changedNote && records.some((item) => item.version === value) ? value : records[0]?.version);
        setBaseline((value) => changedNote ? records[1]?.version : value);
      }
    }).catch((failure) => { if (!disposed) setError(failure); }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [editor.taskId, note?.id, note?.version]);
  const current = versions.find((item) => item.version === selected), previous = versions.find((item) => item.version === baseline);
  const matchesCurrent = current?.content === note?.content && (editor.isPrompt || current?.title === note?.title);
  const diff = useMemo(() => current && previous ? parseDiffFromFile({ name: "note.md", contents: previous.content }, { name: "note.md", contents: current.content }) : null, [current, previous]);
  async function restore() {
    if (!note || !current || matchesCurrent || editor.hasDraft || editor.pending || editor.readOnly) return;
    try {
      const updated = await useTaskStore.getState().restoreNote(editor.taskId, note.id, current.version, note.version);
      setSelected(editor.isPrompt ? updated.promptVersion : updated.notes?.find((item) => item.id === note.id)?.version);
      editor.cancel();
    }
    catch (failure) { setError(failure); }
  }
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-2">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft />{t("common:actions.back")}</Button>
      <span className="text-xs font-medium">{t("tasks:notes.history.title")}</span>
      <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => setShowDiff(!showDiff)}>{t(showDiff ? "tasks:notes.history.text" : "tasks:notes.history.diff")}</Button>
    </div>
    {error !== null && <p role="alert" className="p-3 text-xs text-destructive">{getTaskError(error)}</p>}
    {loading ? <p className="p-3 text-xs text-muted-foreground">{t("common:status.loading")}</p> : <>
      <div className="flex shrink-0 flex-wrap gap-2 p-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">{t("tasks:notes.history.from")}
          <select className="min-w-0 rounded border border-input bg-background p-1" value={baseline ?? ""} onChange={(event) => setBaseline(event.target.value === "" ? undefined : Number(event.target.value))}>
            <option value="">{t("tasks:notes.history.noEarlier")}</option>{versions.map((item) => <option key={item.version} value={item.version}>v{item.version} · {new Date(item.createdAt).toLocaleString(i18n.language)}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">{t("tasks:notes.history.to")}
          <select className="min-w-0 rounded border border-input bg-background p-1" value={selected ?? ""} onChange={(event) => setSelected(Number(event.target.value))}>
            {versions.map((item) => <option key={item.version} value={item.version}>v{item.version} · {new Date(item.createdAt).toLocaleString(i18n.language)}</option>)}
          </select>
        </label>
      </div>
      {current && <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 pb-2 text-xs text-muted-foreground">
        <span>{t(current.actor === "agent" ? "tasks:notes.authorAgent" : current.actor === "user" ? "tasks:notes.authorYou" : "tasks:notes.authorUnknown")}</span>
        {current.kind === "baseline" && <span>{t("tasks:notes.history.baseline")}</span>}
        {current.restoredFrom && <span>{t("tasks:notes.history.restoredFrom", { version: current.restoredFrom })}</span>}
        <Button variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(current.content).catch(setError)}><Copy />{t("tasks:notes.copy")}</Button>
        <Button variant="ghost" size="sm" onClick={() => void getTasksApi().exportNote(editor.taskId, current.noteId, current.version).catch(setError)}><Download />{t("tasks:notes.export")}</Button>
        <Button variant="outline" size="sm" disabled={editor.readOnly || editor.pending || editor.hasDraft || matchesCurrent} onClick={() => void restore()}><RotateCcw />{t("tasks:notes.history.restore")}</Button>
      </div>}
      {editor.hasDraft && <p className="px-3 pb-2 text-xs text-muted-foreground">{t("tasks:notes.history.draftBlocked")}</p>}
      {previous && current && previous.title !== current.title && <p className="px-3 pb-2 text-xs">{t("tasks:notes.history.titleChanged", { from: previous.title, to: current.title })}</p>}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {showDiff && diff ? <FileDiff fileDiff={diff} options={{ diffStyle: "unified", disableFileHeader: true }} /> : current && <TaskNoteMarkdown content={current.content} />}
        {!versions.length && <p className="text-xs text-muted-foreground">{t("tasks:notes.history.empty")}</p>}
      </div>
    </>}
  </div>;
}
