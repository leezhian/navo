import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Task } from "@/domain/tasks";

interface TaskDetailsProps {
  /** 当前选中的任务，状态变化后同步展示最新数据。 */
  task: Task;
  /** 关闭详情面板并恢复完整任务看板。 */
  onClose: () => void;
}

export function TaskDetails({ task, onClose }: TaskDetailsProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div className="task-details-inner">
      <header className="task-details-header">
        <h2 id="task-details-heading">任务详情</h2>
        <Button aria-label="关闭任务详情" className="task-details-close" size="icon" variant="ghost" onClick={onClose}>
          <X aria-hidden="true" size={17} strokeWidth={1.65} />
        </Button>
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
            <div><dt>状态</dt><dd>{task.status}</dd></div>
            <div><dt>日期</dt><dd><time dateTime={task.date}>{task.date.replace(/-/g, ".")}</time></dd></div>
            <div><dt>项目</dt><dd>{task.projectName}</dd></div>
          </dl>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
