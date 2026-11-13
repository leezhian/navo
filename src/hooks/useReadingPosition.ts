import { useCallback } from "react";
import { readScrollPosition, writeScrollPosition } from "@/stores/readingPositionStore";

/** 绑定实际滚动容器；等数据与尺寸就绪后恢复，隐藏容器的零位置不覆盖阅读记录。 */
export function useReadingPosition<Element extends HTMLElement>(key: string | undefined, ready = true) {
  return useCallback((element: Element | null) => {
    if (!element || !key) return;
    const cacheKey = key;
    const target = element;
    let position = readScrollPosition(cacheKey) ?? { top: 0, left: 0 };
    let restoring = true;
    const visible = () => target.clientWidth > 0 && target.clientHeight > 0;
    function restore() {
      if (!ready || !visible()) { restoring = true; return; }
      if (!restoring) return;
      target.scrollTop = position.top;
      target.scrollLeft = position.left;
      // Markdown 图片没有预留高度，首次滚动可能被裁短。等待阅读位置上方及
      // 视口内的图片加载后重试；视口之后的懒加载图片不阻塞恢复。
      const viewportBottom = target.getBoundingClientRect().bottom;
      restoring = Array.from(target.querySelectorAll("img")).some((image) => !image.complete && image.getBoundingClientRect().top <= viewportBottom);
    }
    function save() {
      if (!ready || restoring || !visible()) return;
      position = { top: target.scrollTop, left: target.scrollLeft };
      writeScrollPosition(cacheKey, position);
    }
    function stopRestoring() {
      if (!ready || !visible()) return;
      restoring = false;
      save();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) stopRestoring();
    }
    const observer = new ResizeObserver(restore);
    observer.observe(target);
    target.addEventListener("scroll", save, { passive: true });
    // load/error 不冒泡，使用捕获接收图片完成通知。用户主动操作后不再抢回位置。
    target.addEventListener("load", restore, true);
    target.addEventListener("error", restore, true);
    target.addEventListener("wheel", stopRestoring, { passive: true });
    target.addEventListener("pointerdown", stopRestoring, { passive: true });
    target.addEventListener("touchstart", stopRestoring, { passive: true });
    target.addEventListener("keydown", onKeyDown);
    restore();
    return () => {
      observer.disconnect();
      target.removeEventListener("scroll", save);
      target.removeEventListener("load", restore, true);
      target.removeEventListener("error", restore, true);
      target.removeEventListener("wheel", stopRestoring);
      target.removeEventListener("pointerdown", stopRestoring);
      target.removeEventListener("touchstart", stopRestoring);
      target.removeEventListener("keydown", onKeyDown);
    };
  }, [key, ready]);
}
