import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import { Button } from "@/components/ui/button";
import { getTasksApi } from "@/services/taskApi";
import { getTaskError } from "@/services/taskErrors";

interface TaskInitializationPanelProps {
  /** SQLite 保存的执行检查点；输出在对应命令终端中查看。 */
  task: Task;
}
export function TaskInitializationPanel({ task }: TaskInitializationPanelProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const steps = task.initialization ?? [];
  if (!steps.length) return null;
  const running = steps.some((step) => step.status === "running");
  const unfinished = steps.some((step) => step.status !== "succeeded");
  async function retry() {
    setBusy(true); setError(null);
    try { await getTasksApi().retryInitialization(task.id); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <details className="mx-2 rounded-lg border border-border/60 p-2 text-xs" open={unfinished || undefined}>
    <summary className="cursor-default select-none text-muted-foreground">{t("tasks:context.setup")}</summary>
    <div className="mt-2 space-y-2">{steps.map((step) => <div key={step.id} className="flex items-center justify-between gap-2">
      <span className="truncate" title={task.resources?.find((resource) => resource.resourceId === step.resourceId)?.workingPath}>{step.name}</span>
      <span className={step.status === "failed" ? "shrink-0 text-destructive" : "shrink-0 text-muted-foreground"}>{t(`tasks:context.${step.status}`)}</span>
    </div>)}</div>
    {unfinished && !running && <Button variant="ghost" size="sm" className="mt-2 h-6 px-1 text-xs" title={t("tasks:context.retryHint")} disabled={busy || task.status === "ARCHIVED"} onClick={() => void retry()}>{t("tasks:context.retry")}</Button>}
    {error !== null && <p role="alert" className="mt-2 text-destructive">{getTaskError(error)}</p>}
  </details>;
}
