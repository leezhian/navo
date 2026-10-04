import { useRef } from "react";
import type { ComponentProps } from "react";
import type { Popover } from "radix-ui";

/** 保留嵌套 Select 的模态行为，父层只响应真正位于弹层外部的点击。 */
export function useNestedPopoverDismiss() {
  const contentRef = useRef<HTMLDivElement>(null);
  const onPointerDownOutside: NonNullable<ComponentProps<typeof Popover.Content>["onPointerDownOutside"]> = (event) => {
    const content = contentRef.current;
    if (!content) return;
    const pointer = event.detail.originalEvent;
    const document = content.ownerDocument;
    if (pointer.target !== document.body && pointer.target !== document.documentElement) return;

    // Select 禁用父层指针事件后，内部点击会落到页面根节点；延迟关闭时 Select 已卸载，须按原始坐标判断。
    const bounds = content.getBoundingClientRect();
    if (pointer.clientX >= bounds.left && pointer.clientX <= bounds.right
      && pointer.clientY >= bounds.top && pointer.clientY <= bounds.bottom) event.preventDefault();
  };
  return { contentRef, onPointerDownOutside };
}
