import type { Task, TaskStatus } from "@/domain/tasks";

export function moveTask(
  tasks: Task[],
  taskId: string,
  status: TaskStatus,
  beforeTaskId: string | null = null,
): Task[] {
  const task = tasks.find((item) => item.id === taskId);
  if (!task || beforeTaskId === taskId) return tasks;

  const remainingTasks = tasks.filter((item) => item.id !== taskId);
  const targetTasks = remainingTasks.filter((item) => item.status === status);
  const nextTask = beforeTaskId === null ? undefined : targetTasks.find((item) => item.id === beforeTaskId);
  if (beforeTaskId !== null && !nextTask) return tasks;
  if (task.status === status) {
    const originalColumnTasks = tasks.filter((item) => item.status === status);
    const originalIndex = originalColumnTasks.findIndex((item) => item.id === taskId);
    const originalNextTaskId = originalColumnTasks[originalIndex + 1]?.id ?? null;
    if (originalNextTaskId === beforeTaskId) return tasks;
  }

  // 先移除原卡片，再按目标位置插入；同列排序不改变状态或任务信息。
  const movedTask = task.status === status ? task : { ...task, status };
  const lastTargetTask = targetTasks[targetTasks.length - 1];
  const insertionIndex = nextTask
    ? remainingTasks.indexOf(nextTask)
    : lastTargetTask ? remainingTasks.indexOf(lastTargetTask) + 1 : remainingTasks.length;
  const reorderedTasks = [...remainingTasks];
  reorderedTasks.splice(insertionIndex, 0, movedTask);

  return reorderedTasks.every((item, index) => item === tasks[index]) ? tasks : reorderedTasks;
}
