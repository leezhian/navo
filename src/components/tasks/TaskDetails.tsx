import type { Task } from "@/domain/tasks";
import { TaskWorkspace } from "./workspace/TaskWorkspace";

interface TaskDetailsProps {
  /** 看板、侧栏、标签共用的最新任务数据。 */
  task: Task;
  /** 仅关闭视图，不停止会话。 */
  onClose: () => void;
  /** 侧栏提升到独立标签。 */
  onOpenPage?: () => void;
  /** 多个页面实例的标题标识必须唯一。 */
  headingId?: string;
}

export function TaskDetails({ task, onClose, onOpenPage, headingId = "task-details-heading" }: TaskDetailsProps) {
  return <TaskWorkspace key={task.id} task={task} headingId={headingId} onClose={onClose} onOpenPage={onOpenPage} />;
}
