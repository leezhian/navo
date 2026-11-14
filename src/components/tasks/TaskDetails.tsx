import type { Task } from "@/domain/tasks";
import { TaskWorkspace } from "./workspace/TaskWorkspace";
import type { TaskNoteOpenRequest, TaskSessionOpenRequest } from "@/stores/taskTabsStore";

interface TaskDetailsProps {
  /** 看板、侧栏、标签共用的最新任务数据。 */
  task: Task;
  /** 仅关闭视图，不停止会话。 */
  onClose: () => void;
  /** 侧栏提升到独立标签。 */
  onOpenPage?: () => void;
  /** 多个页面实例的标题标识必须唯一。 */
  headingId?: string;
  /** 本机笔记链接仅定位任务标签中的面板，不影响隐藏的列表侧栏。 */
  noteRequest?: TaskNoteOpenRequest | null;
  /** 本机会话链接定位到对应会话；归档会话只读打开。 */
  sessionRequest?: TaskSessionOpenRequest | null;
}

export function TaskDetails({ task, onClose, onOpenPage, headingId = "task-details-heading", noteRequest, sessionRequest }: TaskDetailsProps) {
  return <TaskWorkspace key={task.id} task={task} headingId={headingId} onClose={onClose} onOpenPage={onOpenPage} noteRequest={noteRequest} sessionRequest={sessionRequest} />;
}
