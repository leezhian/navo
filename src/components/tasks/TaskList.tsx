import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { Collapsible } from "radix-ui";
import { Button } from "@/components/ui/button";
import type { Task, TaskStatus } from "@/domain/tasks";
import type { TaskDisplayOptions } from "@/domain/taskView";
import type { TaskDragPreview, TaskDropTarget, useTaskDrag } from "@/hooks/useTaskDrag";
import { taskColumns } from "./taskConstants";
import { TaskListRow } from "./TaskListRow";
import { TaskDropPlaceholder } from "./TaskDropPlaceholder";

interface TaskListProps {
  /** 已筛选并按属性排序的任务，按状态分组。 */
  tasks: Task[];
  /** 控制日期与项目显示，不改变详情字段。 */
  display: TaskDisplayOptions;
  /** 当前已打开详情的任务标识。 */
  selectedTaskId: string | null;
  /** 点击或键盘确认后打开任务详情。 */
  onSelectTask: (taskId: string) => void;
  /** 拖动源与有效目标状态；源位置占位，目标组仅高亮反馈。 */
  dragPreview: TaskDragPreview | null;
  dropTarget: TaskDropTarget | null;
  /** 加载和写入时不传入，停用拖拽。 */
  pointerHandlers?: ReturnType<typeof useTaskDrag>["pointerHandlers"];
  /** 区分无任务与筛选无结果。 */
  filtered: boolean;
  /** 收起的状态组，由页面保留，切换到看板后不重置。 */
  collapsedStatuses: TaskStatus[];
  /** 独立更新指定状态组的展开状态，不影响任务数据和详情。 */
  onGroupOpenChange: (status: TaskStatus, open: boolean) => void;
}

export function TaskList({ tasks, display, selectedTaskId, onSelectTask, dragPreview, dropTarget, pointerHandlers, filtered, collapsedStatuses, onGroupOpenChange }: TaskListProps) {
  const { t } = useTranslation(["common", "tasks"]);
  return (
    <motion.div className="task-list" layoutScroll {...pointerHandlers}>
      {taskColumns.map(({ status, icon: StatusIcon }) => {
        const groupTasks = tasks.filter((task) => task.status === status);
        const target = dropTarget?.status === status ? dropTarget : null;
        const headingId = "task-list-" + status.toLowerCase();
        const open = !collapsedStatuses.includes(status);
        return (
          <Collapsible.Root key={status} open={open} onOpenChange={(nextOpen) => onGroupOpenChange(status, nextOpen)} asChild>
          <section aria-labelledby={headingId} className="task-list-group" data-board-group={status} data-drop-target={!!target}>
            <header>
              <h2 id={headingId} className="m-0">
                <Collapsible.Trigger asChild>
                  <Button className="task-list-header" variant="ghost" aria-label={t("common:groups.label", { group: status })}>
                    <ChevronDown aria-hidden="true" className="task-list-chevron text-muted-foreground" size={14} />
                    <StatusIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                    <span>{status}</span><span className="font-normal text-muted-foreground">{groupTasks.length}</span>
                  </Button>
                </Collapsible.Trigger>
              </h2>
            </header>
            <Collapsible.Content className="task-list-collapse">
            <div className="task-list-group-content" data-board-content="">
              {groupTasks.map((task) => (
                <Fragment key={task.id}>
                  {task.id === dragPreview?.task.id ? <TaskDropPlaceholder height={dragPreview.height} /> : (
                    <motion.div data-board-item={task.id} data-task-id={task.id} layout="position"
                      transition={{ layout: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }}>
                      <TaskListRow task={task} display={display} selected={selectedTaskId === task.id}
                        onSelect={() => onSelectTask(task.id)} selectOnClick={!pointerHandlers} />
                    </motion.div>
                  )}
                </Fragment>
              ))}
              {groupTasks.length === 0 && <p className="ade-empty-state">{t(filtered ? "tasks:empty.matches" : "tasks:empty.tasks")}</p>}
            </div>
            </Collapsible.Content>
          </section>
          </Collapsible.Root>
        );
      })}
    </motion.div>
  );
}
