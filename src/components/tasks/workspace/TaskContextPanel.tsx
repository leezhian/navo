import type { ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { TaskPanelSheet } from "./TaskPanelSheet";

interface TaskContextPanelProps {
  /** 宽屏分栏与窄屏 Sheet 共用同一份资源导航。 */
  children: ReactNode;
  /** 以任务工作台宽度判断，不使用窗口宽度。 */
  narrow: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 宽屏拖动后的宽度，窄屏仍受容器最大宽度约束。 */
  width: number;
  /** 遮罩和内容只挂载到工作台内容区域，不覆盖其他任务。 */
  container: HTMLDivElement | null;
  /** Esc 或遮罩关闭后恢复焦点，不抢占上层弹窗的焦点。 */
  triggerRef: RefObject<HTMLButtonElement | null>;
}

export function TaskContextPanel({ children, narrow, open, onOpenChange, width, container, triggerRef }: TaskContextPanelProps) {
  const { t } = useTranslation(["tasks", "common"]);
  if (!narrow) return open ? <div className="task-context-container" style={{ width }}>{children}</div> : null;

  return <TaskPanelSheet side="left" open={open} onOpenChange={onOpenChange} width={width} container={container} triggerRef={triggerRef}
    className="task-context-container task-context-sheet" title={t("tasks:runtime.context")} closeLabel={t("tasks:runtime.hideContext")}>
    {children}
  </TaskPanelSheet>;
}
