import type { Task } from "@/domain/tasks";

interface TaskCardProps {
  /** 卡片仅展示任务标题、日期与项目名称。 */
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
  const formattedDate = task.date.replace(/-/g, ".");

  return (
    <article
      className="task-card"
      draggable={false}
      data-selected={selected}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
      aria-label={onSelect ? `查看任务：${task.title}` : undefined}
      onClick={(event) => { if (selectOnClick || event.detail === 0) onSelect?.(); }}
      onKeyDown={(event) => {
        if (!onSelect || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onSelect();
      }}
    >
      <h3 className="task-title" title={task.title}>{task.title}</h3>
      {(showDate || showProject) && <div className="task-metadata">
        {showDate && <time dateTime={task.date}>{formattedDate}</time>}
        {showProject && <span className="task-project ml-auto" title={task.projectName}>{task.projectName}</span>}
      </div>}
    </article>
  );
}
