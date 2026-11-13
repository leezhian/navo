import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

const DEFAULT_FILE_TREE_WIDTH = 360;
const MIN_FILE_TREE_WIDTH = 200;
const COLLAPSE_DRAG_DISTANCE = 80;

interface ResizeState {
  /** 开始拖拽时的指针横坐标，用于计算本次拖拽位移。 */
  startPointerX: number;
  /** 开始拖拽时的文件树宽度，拖拽过程中以它为基准增减。 */
  startWidth: number;
}

export function useResizableFileTree(onCollapse: () => void) {
  const [fileTreeWidth, setFileTreeWidth] = useState(DEFAULT_FILE_TREE_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const listenersRef = useRef<{
    handleMove: (event: PointerEvent) => void;
    handleEnd: () => void;
  } | null>(null);

  const stopResize = useCallback(() => {
    if (listenersRef.current) {
      window.removeEventListener("pointermove", listenersRef.current.handleMove);
      window.removeEventListener("pointerup", listenersRef.current.handleEnd);
      window.removeEventListener("pointercancel", listenersRef.current.handleEnd);
      listenersRef.current = null;
    }

    resizeStateRef.current = null;
    setIsResizing(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const handleResizeMove = useCallback(
    (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const nextWidth = resizeState.startWidth - (event.clientX - resizeState.startPointerX);
      // 小于最小宽度后继续向右拖 80px，才判定为明确关闭意图。
      const isClosingIntent = nextWidth < MIN_FILE_TREE_WIDTH - COLLAPSE_DRAG_DISTANCE;
      if (isClosingIntent) {
        setFileTreeWidth(MIN_FILE_TREE_WIDTH);
        onCollapse();
        stopResize();
        return;
      }

      setFileTreeWidth(Math.max(nextWidth, MIN_FILE_TREE_WIDTH));
    },
    [onCollapse, stopResize],
  );

  const startResize = useCallback(
    (event: ReactPointerEvent) => {
      event.preventDefault();
      stopResize();

      resizeStateRef.current = {
        startPointerX: event.clientX,
        startWidth: fileTreeWidth,
      };
      setIsResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      listenersRef.current = {
        handleMove: handleResizeMove,
        handleEnd: stopResize,
      };
      window.addEventListener("pointermove", handleResizeMove);
      window.addEventListener("pointerup", stopResize);
      window.addEventListener("pointercancel", stopResize);
    },
    [fileTreeWidth, handleResizeMove, stopResize],
  );

  useEffect(() => stopResize, [stopResize]);

  return {
    fileTreeWidth,
    isResizing,
    startResize,
  };
}
