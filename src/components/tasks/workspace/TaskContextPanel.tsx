import { useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

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
  const contentRef = useRef<HTMLDivElement>(null);
  if (!narrow) return open ? <div className="task-context-container" style={{ width }}>{children}</div> : null;

  return <Sheet modal={false} open={open} onOpenChange={onOpenChange}>
    {container && <SheetContent ref={contentRef} container={container} side="left" showCloseButton={false}
      className="task-context-container task-context-sheet motion-reduce:animate-none" style={{ width }} aria-describedby={undefined}
      overlay={<button className="task-context-backdrop duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none"
        data-state={open ? "open" : "closed"} tabIndex={-1} aria-label={t("tasks:runtime.hideContext")} onClick={() => onOpenChange(false)} />}
      onInteractOutside={(event) => event.preventDefault()}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        const focused = document.activeElement;
        if (focused === document.body || (focused instanceof Node && contentRef.current?.contains(focused))) triggerRef.current?.focus();
      }}>
      <SheetTitle className="sr-only">{t("tasks:runtime.context")}</SheetTitle>
      {children}
    </SheetContent>}
  </Sheet>;
}
