import { Button } from "@/components/ui/button";
import type { Task } from "@/domain/tasks";
import type { TaskDisplayOptions } from "@/domain/taskView";
import { taskColumns } from "./taskConstants";

interface TaskListProps {
  /** 已筛选、排序的任务，仍按状态分组。 */
  tasks: Task[];
  /** 控制行内日期与项目显示，不改变详情字段。 */
  display: TaskDisplayOptions;
  /** 当前已打开详情的任务标识。 */
  selectedTaskId: string | null;
  /** 点击或键盘确认后打开任务详情。 */
  onSelectTask: (taskId: string) => void;
}

export function TaskList({ tasks, display, selectedTaskId, onSelectTask }: TaskListProps) {
  return (
    <div className="task-list">
      {taskColumns.map(({ status, icon: StatusIcon }) => {
        const groupTasks = tasks.filter((task) => task.status === status);
        const headingId = "task-list-" + status.toLowerCase();
        return (
          <section key={status} aria-labelledby={headingId} className="task-list-group">
            <header className="task-list-header">
              <StatusIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              <h2 id={headingId}>{status}</h2><span className="text-muted-foreground">{groupTasks.length}</span>
            </header>
            {groupTasks.map((task) => (
              <Button key={task.id} aria-label={"查看任务：" + task.title} aria-pressed={selectedTaskId === task.id} className="task-list-row"
                data-selected={selectedTaskId === task.id} variant="ghost" onClick={() => onSelectTask(task.id)}>
                <span className="min-w-0 truncate" title={task.title}>{task.title}</span>
                <span className="task-list-metadata">
                  {display.showProject && <span className="task-project" title={task.projectName}>{task.projectName}</span>}
                  {display.showDate && <time dateTime={task.date}>{task.date.replace(/-/g, ".")}</time>}
                </span>
              </Button>
            ))}
            {groupTasks.length === 0 && <p className="ade-empty-state">暂无任务</p>}
          </section>
        );
      })}
    </div>
  );
}
