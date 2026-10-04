import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { TaskCard } from "./TaskCard";
import { TaskDetails } from "./TaskDetails";
import { TaskToolbar } from "./TaskToolbar";
import { TaskList } from "./TaskList";
import { taskColumns as columnDefinitions } from "./taskConstants";
import { ResizableWorkspace } from "@/components/layout/ResizableWorkspace";
import { Button } from "@/components/ui/button";
import { getTaskError } from "@/services/taskErrors";
import type { Task, TaskStatus } from "@/domain/tasks";
import type { TaskDisplayOptions } from "@/domain/taskView";
import { useTasks } from "@/hooks/useTasks";
import { useTaskView } from "@/hooks/useTaskView";
import { useTaskDrag } from "@/hooks/useTaskDrag";
import { useTaskTabsStore } from "@/stores/taskTabsStore";
import type { TaskDragPreview, TaskDropTarget } from "@/hooks/useTaskDrag";

const LAYOUT_TRANSITION = { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };

interface TaskColumnData {
  /** 当前列的状态名称。 */
  status: TaskStatus;
  /** 状态标题的辅助图标。 */
  icon: LucideIcon;
  /** 已按状态分组的任务。 */
  tasks: Task[];
}

interface TaskColumnProps {
  /** 当前列的状态、图标和任务集合。 */
  column: TaskColumnData;
  /** 浮动卡片数据，用于移除源卡片并保持占位框高度。 */
  dragPreview: TaskDragPreview | null;
  /** 当前列的插入位置，非目标列传入 null。 */
  dropTarget: TaskDropTarget | null;
  /** 当前打开详情的任务标识，未选中时为 null。 */
  selectedTaskId: string | null;
  /** 打开指定任务的右侧详情区域。 */
  onSelectTask: (taskId: string) => void;
  /** 日期与项目显隐、排序控制点击和拖拽承接方式。 */
  display: TaskDisplayOptions;
  /** 存在筛选条件时使用匹配结果空提示。 */
  filtered: boolean;
}

function TaskColumn({ column, dragPreview, dropTarget, selectedTaskId, onSelectTask, display, filtered }: TaskColumnProps) {
  const { t: translate } = useTranslation();
  const StatusIcon = column.icon;
  const headingId = "task-column-" + column.status.toLowerCase();
  const visibleTasks = column.tasks.filter((task) => task.id !== dragPreview?.task.id);
  const placeholder = (
    <motion.div
      aria-hidden="true"
      className="task-drop-placeholder"
      layout="position"
      style={{ height: dragPreview?.height }}
      transition={{ layout: LAYOUT_TRANSITION }}
    />
  );

  return (
    <section aria-labelledby={headingId} className="task-column" data-status={column.status}>
      <header className="task-column-header">
        <StatusIcon aria-hidden="true" className="column-status-icon" size={17} strokeWidth={1.65} />
        <h2 id={headingId}>{column.status}</h2>
        <span aria-label={translate("{{count}} 个任务", { count: column.tasks.length })} className="column-task-count">{column.tasks.length}</span>
      </header>
      <motion.div className="task-column-content" layoutScroll>
        {visibleTasks.map((task) => (
          <Fragment key={task.id}>
            {dropTarget?.beforeTaskId === task.id && placeholder}
            <motion.div className="task-card-slot" data-task-id={task.id} layout="position" layoutId={task.id} transition={{ layout: LAYOUT_TRANSITION }}>
              <TaskCard task={task} selected={selectedTaskId === task.id} onSelect={() => onSelectTask(task.id)}
                selectOnClick={display.order !== "manual"} showDate={display.showDate} showProject={display.showProject} />
            </motion.div>
          </Fragment>
        ))}
        {dropTarget && dropTarget.beforeTaskId === null && placeholder}
        {column.tasks.length === 0 && !dragPreview && <p className="ade-empty-state">{filtered ? translate("暂无匹配任务") : translate("暂无任务")}</p>}
      </motion.div>
    </section>
  );
}

export function TaskBoard() {
  const { t: translate } = useTranslation();
  const { tasks, move, pending, loaded, loading, error, recoveryWarnings, bootstrap, requestedTaskId, requestOpen } = useTasks();
  const view = useTaskView(tasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const { taskIds: openTaskIds, activateTask, openTask } = useTaskTabsStore();
  const selectTask = useCallback((taskId: string) => {
    setSelectedTaskId(activateTask(taskId) ? null : taskId);
  }, [activateTask]);
  const selectedTask = view.visibleTasks.find((task) => task.id === selectedTaskId);
  const canDrag = loaded && !pending && view.display.mode === "board" && view.display.order === "manual";
  const requestedVisible = view.visibleTasks.some((task) => task.id === requestedTaskId);
  useEffect(() => {
    if (requestedTaskId && (requestedVisible || openTaskIds.includes(requestedTaskId))) { selectTask(requestedTaskId); requestOpen(null); }
  }, [requestedTaskId, requestedVisible, openTaskIds, selectTask, requestOpen]);
  const { dragPreview, dropTarget, dropDuration, pointerHandlers } = useTaskDrag({
    tasks: view.visibleTasks,
    onMove: (taskId, target) => { void move(taskId, target.status, target.beforeTaskId); },
    onTaskClick: selectTask,
  });
  const taskColumns = columnDefinitions.map((column) => ({ ...column, tasks: view.visibleTasks.filter((task) => task.status === column.status) }));

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="task-board">
        <ResizableWorkspace
          details={selectedTask ? <TaskDetails task={selectedTask} onClose={() => setSelectedTaskId(null)} onOpenPage={() => { openTask(selectedTask.id); setSelectedTaskId(null); }} /> : null}
          detailsHeadingId="task-details-heading"
          listLabel={translate("任务面板")}
        >
          <div className="task-panel-content">
            {error !== null && <div role="alert" className="flex items-center gap-3 px-4 pt-3 text-xs text-destructive"><span>{getTaskError(error)}</span><Button variant="ghost" size="sm" disabled={loading || pending} onClick={() => void bootstrap()}>{translate("重试")}</Button></div>}
            {recoveryWarnings.length > 0 && <div role="alert" className="px-4 pt-3 text-xs text-muted-foreground"><p>{translate("上次任务创建未完成，以下工作目录已保留，请检查。")}</p><pre className="mt-1 whitespace-pre-wrap break-all">{recoveryWarnings.join("\n")}</pre></div>}
            {requestedTaskId && !requestedVisible && <div className="flex items-center gap-2 px-4 pt-3 text-xs text-muted-foreground"><span>{translate("任务已创建，但被当前筛选隐藏。")}</span><Button size="sm" variant="ghost" onClick={view.clearFilters}>{translate("查看任务")}</Button><Button size="sm" variant="ghost" onClick={() => requestOpen(null)}>{translate("关闭")}</Button></div>}
            <TaskToolbar tasks={tasks} filters={view.filters} display={view.display}
              projectNames={view.projectNames} hasFilters={view.hasFilters} onFiltersChange={view.setFilters}
              onDisplayChange={view.setDisplay} onClearFilters={view.clearFilters} />
            {!loaded ? <div className="min-h-40" role="status" aria-label={loading ? translate("正在加载任务") : undefined} /> : view.display.mode === "board" ? (
              <motion.div className="task-board" layoutScroll {...(canDrag ? pointerHandlers : {})}>
                {taskColumns.map((column) => (
                  <TaskColumn key={column.status} column={column} dragPreview={dragPreview}
                    dropTarget={dropTarget?.status === column.status ? dropTarget : null}
                    selectedTaskId={selectedTaskId} onSelectTask={selectTask} display={view.display} filtered={view.hasFilters} />
                ))}
              </motion.div>
            ) : <TaskList tasks={view.visibleTasks} display={view.display} selectedTaskId={selectedTaskId} onSelectTask={selectTask} />}
          </div>
        </ResizableWorkspace>
        {dragPreview && createPortal(
          <motion.div aria-hidden="true" className="task-drag-overlay" initial={false}
            animate={{ x: dragPreview.left, y: dragPreview.top, width: dragPreview.width, height: dragPreview.height }}
            transition={dragPreview.settling ? { duration: dropDuration, ease: LAYOUT_TRANSITION.ease } : { duration: 0 }}>
            <TaskCard task={dragPreview.task} showDate={view.display.showDate} showProject={view.display.showProject} />
          </motion.div>, document.body,
        )}
      </LayoutGroup>
    </MotionConfig>
  );
}
