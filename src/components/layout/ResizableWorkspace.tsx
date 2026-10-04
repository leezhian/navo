import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { TASK_PANEL_GAP, useResizableWorkspace } from "@/hooks/useResizableWorkspace";

interface ResizableWorkspaceProps {
  /** 左侧主体，始终保持挂载以保留滚动位置和分组状态。 */
  children: ReactNode;
  /** 右侧独立详情块；null 表示收起详情。 */
  details: ReactNode | null;
  /** 详情区域标题 id，供辅助技术识别独立面板。 */
  detailsHeadingId: string;
  /** 分隔条描述中的左侧区域名称。 */
  listLabel: string;
}

export function ResizableWorkspace({ children, details, detailsHeadingId, listLabel }: ResizableWorkspaceProps) {
  const { t } = useTranslation(["common", "workspace"]);
  const reducedMotion = useReducedMotion();
  const { workspaceRef, detailsWidth, isResizing, isCentered, boardPercentage, separatorHandlers } = useResizableWorkspace();
  const transition = { duration: reducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div ref={workspaceRef} className="task-workspace" data-resizing={isResizing}>
      <div className="task-board-region">{children}</div>
      <AnimatePresence initial={false}>
        {details && (
          <motion.div key="workspace-separator" role="separator" tabIndex={0}
            aria-label={t("workspace:details.resize", { label: listLabel })} aria-orientation="vertical"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={boardPercentage}
            aria-valuetext={t("workspace:details.ratio", { label: listLabel, percent: boardPercentage, details: 100 - boardPercentage })}
            className="task-panel-separator" initial={{ width: 0 }} animate={{ width: TASK_PANEL_GAP }} exit={{ width: 0 }}
            data-centered={isCentered} transition={transition} {...separatorHandlers} />
        )}
        {details && (
          <motion.aside key="workspace-details" className="task-details-panel" aria-labelledby={detailsHeadingId}
            initial={{ width: 0, opacity: 0 }} animate={{ width: detailsWidth, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
            transition={isResizing ? { duration: 0 } : transition}>{details}</motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
