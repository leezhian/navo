import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useTaskTabs } from "@/hooks/useTaskTabs";
import { useTaskSplitResize } from "@/hooks/useTaskSplitResize";
import { findTaskSplit } from "@/domain/taskSplit";
import { TaskPage } from "./TaskPage";
import { SplitPagePicker } from "./SplitPagePicker";

interface TaskPagesProps {
  /** 一级导航切换时隐藏整个任务工作区，但不卸载页面。 */
  visible: boolean;
}

export function TaskPages({ visible }: TaskPagesProps) {
  const { t } = useTranslation();
  const workspace = useTaskTabs();
  const split = workspace.activeSplit;
  const { containerRef, ratio, resizing, isCentered, separatorHandlers } = useTaskSplitResize(split, workspace.setSplitRatio);
  const vertical = split?.orientation === "vertical";
  const firstSize = `calc((100% - 8px) * ${ratio})`;
  const secondStart = `calc((100% - 8px) * ${ratio} + 8px)`;
  const firstStyle: CSSProperties = vertical ? { top: 0, left: 0, right: 0, height: firstSize } : { top: 0, bottom: 0, left: 0, width: firstSize };
  const secondStyle: CSSProperties = vertical ? { top: secondStart, left: 0, right: 0, bottom: 0 } : { top: 0, bottom: 0, left: secondStart, right: 0 };
  const separatorStyle: CSSProperties = vertical ? { top: firstSize, left: 0, right: 0, height: 8 } : { top: 0, bottom: 0, left: firstSize, width: 8 };

  return <div ref={containerRef} className="task-pages" hidden={!visible} data-resizing={resizing}>
    {/* 页面始终是同一父节点下的稳定 keyed 子节点，拆分、交换和反转只调整位置。 */}
    {workspace.tabs.map((task) => {
      const inSplit = split?.firstTaskId === task.id || split?.secondTaskId === task.id;
      const shown = visible && (inSplit || (!split && workspace.activeTaskId === task.id));
      const style = inSplit ? split?.firstTaskId === task.id ? firstStyle : secondStyle : { inset: 0 };
      return <div key={task.id} id={`task-page-${task.id}`} role="tabpanel" aria-label={task.title} className="task-page-position" hidden={!shown} style={style}
        data-focused={workspace.activeTaskId === task.id} onPointerDownCapture={() => workspace.activateTask(task.id)} onFocusCapture={() => workspace.activateTask(task.id)}>
        <TaskPage task={task} onClose={() => workspace.closeTask(task.id)} />
      </div>;
    })}
    {split && <>
      <div role="separator" tabIndex={0} aria-label={t("调整拆分视图大小")} aria-orientation={vertical ? "horizontal" : "vertical"}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}
        className="task-split-separator" data-orientation={split.orientation} data-centered={isCentered} style={separatorStyle} {...separatorHandlers} />
      {!split.secondTaskId && <div id={`split-picker-${split.id}`} className="task-page-position" style={secondStyle}>
        <SplitPagePicker tasks={workspace.tabs.filter((task) => !findTaskSplit(workspace.splits, task.id))}
          onSelect={(id) => workspace.completeSplit(split.id, id)} onCancel={() => workspace.cancelSplit(split.id)} />
      </div>}
    </>}
  </div>;
}
