import { formatDate } from "@/i18n";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { SquareArrowOutUpRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import type { Task } from "@/domain/tasks";
import { TaskContextDetails } from "./TaskContextDetails";
import { taskProjectNames } from "@/utils/taskProjects";

interface TaskDetailsProps {
  /** 当前选中的任务，状态变化后同步展示最新数据。 */
  task: Task;
  /** 关闭当前侧栏或标签，由调用方决定返回面板还是相邻任务页。 */
  onClose: () => void;
  /** 仅侧栏提供，将当前详情提升为任务标签页。 */
  onOpenPage?: () => void;
  /** 多个标签页面挂载时保持标题标识唯一。 */
  headingId?: string;
}

export function TaskDetails({ task, onClose, onOpenPage, headingId = "task-details-heading" }: TaskDetailsProps) {
  const { t: translate } = useTranslation();
  const reducedMotion = useReducedMotion();

  return (
    <div className="task-details-inner">
      <header className="task-details-header">
        <h2 id={headingId}>{translate("任务详情")}</h2>
        <div className="flex items-center gap-1">
          {onOpenPage && <IconTooltip label={translate("打开任务页面")} className="task-details-close" onClick={onOpenPage}><SquareArrowOutUpRight aria-hidden="true" size={17} strokeWidth={1.65} /></IconTooltip>}
          <Button aria-label={translate("关闭任务详情")} className="task-details-close" size="icon" variant="ghost" onClick={onClose}>
            <X aria-hidden="true" size={17} strokeWidth={1.65} />
          </Button>
        </div>
      </header>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={task.id}
          className="task-details-body"
          initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
          transition={{ duration: reducedMotion ? 0 : 0.14 }}
        >
          <h3 className="task-details-title">{task.title}</h3>
          <dl className="task-details-metadata">
            <div><dt>{translate("状态")}</dt><dd>{task.status}</dd></div>
            <div><dt>{translate("日期")}</dt><dd><time dateTime={task.date}>{formatDate(task.date)}</time></dd></div>
            <div><dt>{translate("项目")}</dt><dd>{taskProjectNames(task).join(", ") || translate("未关联项目")}</dd></div>
          </dl>
          <TaskContextDetails task={task} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
