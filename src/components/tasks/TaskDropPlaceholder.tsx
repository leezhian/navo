import { motion } from "motion/react";

interface TaskDropPlaceholderProps {
  /** 保持源任务尺寸，列表与卡片分别传入原始高度。 */
  height: number;
}

export function TaskDropPlaceholder({ height }: TaskDropPlaceholderProps) {
  return <motion.div aria-hidden="true" className="task-drop-placeholder" data-board-placeholder=""
    style={{ height }} layout="position"
    transition={{ layout: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }} />;
}
