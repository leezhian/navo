import type { Task } from "@/domain/tasks";
import { useTranslation } from "react-i18next";
import { TaskContextMenu } from "./TaskContextMenu";
import { taskProjectLabel, taskProjectNames } from "@/utils/taskProjects";
import { TaskSessionSummary } from "./TaskSessionSummary";
import { TaskTime } from "./TaskTime";

interface TaskCardProps {
  /** 展示两行标题、会话状态、标题下的项目名和右下角日期。 */
  task: Task;
  /** 当前卡片是否对应已打开的任务详情。 */
  selected?: boolean;
  /** 键盘或辅助技术打开详情；鼠标点按由看板区分点击与拖拽。 */
  onSelect?: () => void;
  /** 非拖拽视图直接承接鼠标点击，拖拽看板仍由指针手势判断点击。 */
  selectOnClick?: boolean;
  /** 展示选项控制元信息显隐，默认保持日期和项目可见。 */
  showDate?: boolean;
  showProject?: boolean;
}

export function TaskCard({ task, selected = false, onSelect, selectOnClick = false, showDate = true, showProject = true }: TaskCardProps) {
  const { t } = useTranslation(["common", "tasks"]);

  const content = (
    <article
      className="task-card"
      draggable={false}
      data-selected={selected}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
      aria-label={onSelect ? t("tasks:actions.viewLabel", { title: task.title }) : undefined}
      onClick={(event) => { if (selectOnClick || event.detail === 0) onSelect?.(); }}
      onKeyDown={(event) => {
        if (!onSelect || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onSelect();
      }}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="task-title-with-sessions"><h3 className="task-title" title={task.title}>{task.title}</h3><TaskSessionSummary taskId={task.id} /></div>
        {showProject && <span className="task-project text-xs text-muted-foreground" title={taskProjectNames(task).join(", ")}>{taskProjectLabel(task) || t("tasks:fields.noProject")}</span>}
      </div>
      {showDate && <div className="task-metadata">
        <TaskTime value={task.date} />
      </div>}
    </article>
  );
  return onSelect ? <TaskContextMenu task={task} onOpen={onSelect}>{content}</TaskContextMenu> : content;
}
