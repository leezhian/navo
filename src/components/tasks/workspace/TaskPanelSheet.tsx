import { useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface TaskPanelSheetProps {
  /** 上下文与分支栏共用局部 Sheet，仅内容、方向和宽度不同。 */
  children: ReactNode;
  side: "left" | "right";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  title: string;
  closeLabel: string;
  /** 只挂载到当前任务工作台内容区，不锁定其他任务。 */
  container: HTMLDivElement | null;
  /** 关闭后恢复到对应入口，不抢占上层弹窗或另一个面板的焦点。 */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** 保留各面板的内容样式，浮层布局统一由共享类控制。 */
  className?: string;
}

export function TaskPanelSheet({ children, side, open, onOpenChange, width, title, closeLabel, container, triggerRef, className }: TaskPanelSheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  return <Sheet modal={false} open={open} onOpenChange={onOpenChange}>
    {container && <SheetContent ref={contentRef} container={container} side={side} showCloseButton={false}
      className={cn("task-panel-sheet motion-reduce:animate-none", className)} style={{ width }} aria-describedby={undefined}
      overlay={<button className="task-context-backdrop duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none"
        data-state={open ? "open" : "closed"} tabIndex={-1} aria-label={closeLabel} onClick={() => onOpenChange(false)} />}
      onInteractOutside={(event) => event.preventDefault()}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        const focused = document.activeElement;
        if (focused === document.body || (focused instanceof Node && contentRef.current?.contains(focused))) triggerRef.current?.focus();
      }}>
      <SheetTitle className="sr-only">{title}</SheetTitle>
      {children}
    </SheetContent>}
  </Sheet>;
}
