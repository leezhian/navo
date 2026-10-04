import { useTranslation } from "react-i18next";
import { formatDate } from "@/i18n";
import { Button } from "@/components/ui/button";
import type { Task } from "@/domain/tasks";
import type { TaskDisplayOptions } from "@/domain/taskView";
import { taskProjectLabel, taskProjectNames } from "@/utils/taskProjects";
import { TaskContextMenu } from "./TaskContextMenu";

interface TaskListRowProps {
  /** 任务数据及当前字段显隐配置。 */
  task: Task;
  display: TaskDisplayOptions;
  /** 当前详情选中状态。 */
  selected?: boolean;
  /** 打开任务；浮动预览不传入，不挂载右键菜单。 */
  onSelect?: () => void;
  /** 禁用拖拽时由 click 打开，否则由指针手势区分拖动和点按。 */
  selectOnClick?: boolean;
}

export function TaskListRow({ task, display, selected = false, onSelect, selectOnClick = false }: TaskListRowProps) {
  const { t } = useTranslation();
  const content = (
    <Button aria-label={t("查看任务：{{title}}", { title: task.title })} aria-pressed={selected} className="task-list-row"
      draggable={false} tabIndex={onSelect ? 0 : -1} data-selected={selected} variant="ghost"
      onClick={(event) => { if (selectOnClick || event.detail === 0) onSelect?.(); }}>
      <span className="min-w-0 truncate" title={task.title}>{task.title}</span>
      <span className="task-list-metadata">
        {display.showProject && <span className="task-project" title={taskProjectNames(task).join(", ")}>{taskProjectLabel(task) || t("未关联项目")}</span>}
        {display.showDate && <time dateTime={task.date}>{formatDate(task.date)}</time>}
      </span>
    </Button>
  );
  return onSelect ? <TaskContextMenu task={task} onOpen={onSelect}>{content}</TaskContextMenu> : content;
}
