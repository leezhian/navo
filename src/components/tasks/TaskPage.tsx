import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import { TaskDetails } from "./TaskDetails";
import { useTaskTabsStore } from "@/stores/taskTabsStore";

interface TaskPageProps {
  /** 与看板、侧栏共享的最新任务数据。 */
  task: Task;
  /** 关闭当前标签，不删除任务。 */
  onClose: () => void;
}

export function TaskPage({ task, onClose }: TaskPageProps) {
  const { t } = useTranslation(["common", "tasks"]);
  const noteRequest = useTaskTabsStore((state) => state.noteRequest?.taskId === task.id ? state.noteRequest : null);
  return <section className="h-full overflow-hidden rounded-[14px] bg-background" aria-label={t("tasks:page.label", { title: task.title })}>
    <TaskDetails task={task} headingId={`task-page-heading-${task.id}`} onClose={onClose} noteRequest={noteRequest} />
  </section>;
}
