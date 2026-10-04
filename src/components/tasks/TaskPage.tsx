import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import { TaskDetails } from "./TaskDetails";

interface TaskPageProps {
  /** 与看板、侧栏共享的最新任务数据。 */
  task: Task;
  /** 关闭当前标签，不删除任务。 */
  onClose: () => void;
}

export function TaskPage({ task, onClose }: TaskPageProps) {
  const { t } = useTranslation();
  return <section className="h-full overflow-hidden rounded-[14px] bg-background" aria-label={t("任务页面：{{title}}", { title: task.title })}>
    <TaskDetails task={task} headingId={`task-page-heading-${task.id}`} onClose={onClose} />
  </section>;
}
