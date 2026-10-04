import type { Task, TaskStatus } from "@/domain/tasks";
import { useBoardDrag } from "./useBoardDrag";

export interface TaskDropTarget {
  /** 放下卡片后的状态列与插入位置；null 表示列末尾。 */
  status: TaskStatus;
  beforeTaskId: string | null;
}

export interface TaskDragPreview {
  /** 浮动卡片数据、视口位置、原始尺寸及落位动画状态。 */
  task: Task;
  left: number;
  top: number;
  width: number;
  height: number;
  settling: boolean;
}

interface UseTaskDragOptions {
  /** 当前可见任务，拖拽完成前不修改业务数据。 */
  tasks: Task[];
  /** 动画结束后提交状态与顺序。 */
  onMove: (taskId: string, target: TaskDropTarget) => void;
  /** 点按卡片时打开任务。 */
  onTaskClick: (taskId: string) => void;
}

export function useTaskDrag({ tasks, onMove, onTaskClick }: UseTaskDragOptions) {
  const drag = useBoardDrag({
    items: tasks,
    getGroup: (task) => task.status,
    onMove: (taskId, target) => onMove(taskId, { status: target.group as TaskStatus, beforeTaskId: target.beforeItemId }),
    onItemClick: onTaskClick,
  });
  const { dragPreview, dropTarget } = drag;
  return {
    ...drag,
    dragPreview: dragPreview ? { task: dragPreview.item, left: dragPreview.left, top: dragPreview.top, width: dragPreview.width, height: dragPreview.height, settling: dragPreview.settling } : null,
    dropTarget: dropTarget ? { status: dropTarget.group as TaskStatus, beforeTaskId: dropTarget.beforeItemId } : null,
  };
}
