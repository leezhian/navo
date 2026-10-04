import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import type { TaskAttachment } from "@/shared/taskTypes";
import { getTasksApi } from "@/services/taskApi";
import { TaskAttachmentChip } from "./TaskAttachmentChip";

interface TaskContextDetailsProps {
  /** 展示已持久化任务上下文，不触发 Agent、Git 或远程平台操作。 */
  task: Task;
}

export function TaskContextDetails({ task }: TaskContextDetailsProps) {
  const { t } = useTranslation(["common", "taskCreate", "tasks"]);
  const [files, setFiles] = useState<TaskAttachment[]>(task.attachments ?? []);
  useEffect(() => {
    let cancelled = false;
    setFiles(task.attachments ?? []);
    void Promise.all((task.attachments ?? []).map(async (file) => ({
      ...file, preview: await getTasksApi().previewAttachment(task.id, file.id).catch(() => null) ?? undefined,
    }))).then((value) => { if (!cancelled) setFiles(value); });
    return () => { cancelled = true; };
  }, [task.id, task.attachments]);
  return <div className="mt-6 space-y-5 text-xs">
    {task.description && <section><h4 className="mb-2 text-muted-foreground">{t("taskCreate:composer.description")}</h4><p className="whitespace-pre-wrap break-words leading-6">{task.description}</p></section>}
    {!!task.links?.length && <section><h4 className="mb-2 text-muted-foreground">{t("tasks:details.links")}</h4><div className="space-y-2">{task.links.map((link) => <p key={link.id} className="rounded-lg bg-muted/40 p-2"><span className="mr-2 text-muted-foreground">{link.group}</span>{link.title}</p>)}</div></section>}
    {!!task.resources?.length && <section><h4 className="mb-2 text-muted-foreground">{t("taskCreate:resources.title")}</h4><div className="space-y-2">{task.resources.map((resource) => <div key={resource.resourceId} className="rounded-lg bg-muted/40 p-3">
      <p className="font-medium">{resource.name}</p><p className="mt-1 break-all text-muted-foreground">{resource.workingPath}</p>
      {resource.mode !== "folder" && <p className="mt-2 break-all">{resource.targetBranch}{resource.mode === "worktree" && <span className="ml-2 text-muted-foreground">Worktree</span>}</p>}
    </div>)}</div></section>}
    {files.length > 0 && <section><h4 className="mb-2 text-muted-foreground">{t("tasks:details.attachments")}</h4><div className="flex flex-wrap gap-2">{files.map((file) => <TaskAttachmentChip key={file.id} attachment={file} />)}</div></section>}
  </div>;
}
