import { useCallback, useRef } from "react";
import type { ComponentProps, Ref } from "react";
import type { Popover } from "radix-ui";

/** 保留嵌套 Select 的模态行为，父层只响应真正位于弹层外部的点击。 */
export function useNestedLayerDismiss(forwardedRef?: Ref<HTMLDivElement>) {
  const contentRef = useRef<HTMLDivElement>(null);
  const setContentRef = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    if (typeof forwardedRef === "function") {
      const cleanup = forwardedRef(node);
      return () => {
        contentRef.current = null;
        if (typeof cleanup === "function") cleanup();
        else forwardedRef(null);
      };
    }
    if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);
  const onPointerDownOutside: NonNullable<ComponentProps<typeof Popover.Content>["onPointerDownOutside"]> = (event) => {
    const content = contentRef.current;
    if (!content) return;
    const pointer = event.detail.originalEvent;
    const document = content.ownerDocument;
    const target = pointer.target;
    const onOverlay = target instanceof Element && target.matches('[data-slot="dialog-overlay"]');
    if (target !== document.body && target !== document.documentElement && !onOverlay) return;

    // Select 禁用父层指针事件后，内部点击会落到根节点或遮罩；延迟关闭时子层已卸载，须按原始坐标判断。
    const bounds = content.getBoundingClientRect();
    if (pointer.clientX >= bounds.left && pointer.clientX <= bounds.right
      && pointer.clientY >= bounds.top && pointer.clientY <= bounds.bottom) event.preventDefault();
  };
  return { contentRef, setContentRef, onPointerDownOutside };
}
