import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TASK_PANEL_GAP, useResizableWorkspace } from "@/hooks/useResizableWorkspace";

interface TaskIssuePanelsProps {
  /** 列表和预览始终挂载，拖动分隔条不清空选择或预览。 */
  children: ReactNode;
  preview: ReactNode;
  /** 读取任务关联时标记列表忙碌。 */
  busy: boolean;
}

export function TaskIssuePanels({ children, preview, busy }: TaskIssuePanelsProps) {
  const { t } = useTranslation();
  const { workspaceRef, detailsWidth, boardPercentage, isResizing, separatorHandlers } = useResizableWorkspace({
    initialDetailsRatio: 0.44, minimumBoardWidth: 240, minimumDetailsWidth: 200,
  });
  return (
    <div ref={workspaceRef} className="task-issue-panels flex h-[45vh] min-h-56 max-h-[440px] min-w-0 overflow-hidden" data-resizing={isResizing}>
      <div className="min-w-0 flex-1 overflow-auto rounded-xl bg-muted/30 p-2" aria-busy={busy}>{children}</div>
      <div role="separator" tabIndex={0} aria-label={t("调整列表与预览宽度")} aria-orientation="vertical"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={boardPercentage}
        className="task-panel-separator" style={{ width: TASK_PANEL_GAP, background: "transparent" }} {...separatorHandlers} />
      <aside className="min-w-0 shrink-0 overflow-auto rounded-xl bg-muted/30 p-4" style={{ width: detailsWidth }}>{preview}</aside>
    </div>
  );
}
