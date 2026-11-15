import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getTasksApi } from "@/services/taskApi";
import { getTaskError } from "@/services/taskErrors";
import { useTaskStore } from "@/stores/taskStore";
import type { TaskFileInspect, TaskFilePreview, TaskManagedFileKind } from "@/shared/taskResourceLifecycle";
import { TaskNoteMarkdown } from "./TaskNoteMarkdown";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { X } from "lucide-react";

interface TaskFilePreviewPaneProps {
  /** 当前任务，用于读取和保存文件元信息。 */
  taskId: string;
  kind: TaskManagedFileKind;
  fileId: string;
  /** 已归档任务只允许查看、复制和另存为。 */
  readOnly: boolean;
  onClose: () => void;
  onReveal: () => void;
}

function formatSize(size: number) {
  return size < 1024 * 1024 ? Math.max(1, Math.ceil(size / 1024)) + " KB" : (size / (1024 * 1024)).toFixed(1) + " MB";
}

export function TaskFilePreviewPane({ taskId, kind, fileId, readOnly, onClose, onReveal }: TaskFilePreviewPaneProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const [details, setDetails] = useState<TaskFileInspect | null>(null);
  const [preview, setPreview] = useState<TaskFilePreview | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const pending = useTaskStore((state) => state.pending);

  useEffect(() => {
    let cancelled = false;
    setError(null); setPreview(null); setDetails(null);
    void (async () => {
      try {
        const inspected = await getTasksApi().inspectManagedFile(taskId, kind, fileId);
        if (cancelled) return;
        setDetails(inspected); setName(inspected.name); setDescription(inspected.description);
        if (inspected.previewType === "unsupported" || !inspected.exists) { setPreview({ type: inspected.exists ? "unsupported" : "unsupported", size: inspected.size }); return; }
        setPreview(await getTasksApi().previewManagedFile(taskId, kind, fileId));
      } catch (failure) { if (!cancelled) setError(failure); }
    })();
    return () => { cancelled = true; };
  }, [taskId, kind, fileId]);

  async function saveMeta() {
    if (readOnly || busy || pending || !details) return;
    setBusy(true); setError(null);
    try { await useTaskStore.getState().updateFileMeta(taskId, kind, fileId, { name: name.trim(), description }); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }

  return <section data-file-preview className="task-file-preview-pane flex h-full min-h-0 flex-col" aria-label={t("tasks:resources.previewTitle")}>
    <header className="flex items-center gap-2 border-b px-3 py-2">
      <h3 className="min-w-0 flex-1 truncate text-sm font-medium" title={details?.name}>{details?.name ?? t("tasks:resources.previewTitle")}</h3>
      <IconTooltip label={t("tasks:resources.previewClose")} size="icon-xs" onClick={onClose}><X className="size-3.5" /></IconTooltip>
    </header>
    <div className="min-h-0 flex-1 overflow-auto p-3 text-xs">
      {error !== null && <p role="alert" className="mb-2 text-destructive">{getTaskError(error)}</p>}
      {details && <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
        <dt>{t("tasks:resources.size")}</dt><dd>{formatSize(details.size)}</dd>
        <dt>{t("tasks:resources.modified")}</dt><dd>{details.mtime ? new Date(details.mtime).toLocaleString() : t("tasks:resources.missing")}</dd>
        <dt>{t("tasks:resources.source")}</dt><dd>{t(details.source === "path" ? "tasks:resources.sourcePath" : "tasks:resources.sourceAttachment")}</dd>
        <dt className="col-span-2 break-all text-[11px]">{details.location}</dt>
      </dl>}
      {details && <div className="mb-3 space-y-2">
        <Input aria-label={t("tasks:resources.rename")} value={name} disabled={readOnly || busy || pending} onChange={(event) => setName(event.target.value)}
          onBlur={() => { if (name.trim() && name.trim() !== details.name) void saveMeta(); }} />
        <Textarea aria-label={t("tasks:resources.description")} placeholder={t("tasks:resources.addDescription")} value={description} maxLength={2000}
          disabled={readOnly || busy || pending} onChange={(event) => setDescription(event.target.value)} onBlur={() => { if (description !== details.description) void saveMeta(); }} className="min-h-16 text-xs" />
        <div className="flex flex-wrap gap-2">
          {kind === "attachment" && <Button variant="outline" size="sm" disabled={busy || pending} onClick={() => void getTasksApi().saveFileCopy(taskId, kind, fileId)}>{t("tasks:resources.saveAs")}</Button>}
          <Button variant="ghost" size="sm" onClick={onReveal}>{t("tasks:resources.reveal")}</Button>
        </div>
      </div>}
      {!details?.exists && details && <p className="text-muted-foreground">{t("tasks:resources.previewMissing")}</p>}
      {details?.exists && preview?.type === "unsupported" && <p className="text-muted-foreground">{t("tasks:resources.previewUnsupported")}</p>}
      {preview?.type === "image" && preview.dataUrl && <img src={preview.dataUrl} alt={details?.name ?? ""} className="max-w-full rounded border" />}
      {preview?.type === "markdown" && preview.text !== undefined && <TaskNoteMarkdown content={preview.text} />}
      {preview?.type === "text" && preview.text !== undefined && <pre className="overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-5">{preview.text}</pre>}
      {preview?.truncated && <p className="mt-2 text-muted-foreground">{t("tasks:resources.previewTruncated")}</p>}
    </div>
  </section>;
}
