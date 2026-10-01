import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

export const TASK_PANEL_GAP = 8;
const MIN_BOARD_WIDTH = 320;
const MIN_DETAILS_WIDTH = 280;
const KEYBOARD_RESIZE_STEP = 24;

interface ResizeSession {
  pointerId: number;
  startX: number;
  detailsWidth: number;
  availableWidth: number;
}

function clampDetailsWidth(width: number, availableWidth: number) {
  const minimum = Math.min(MIN_DETAILS_WIDTH, availableWidth / 2);
  const maximum = availableWidth - Math.min(MIN_BOARD_WIDTH, availableWidth / 2);
  return Math.max(minimum, Math.min(maximum, width));
}

export function useResizableWorkspace() {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const resizeSession = useRef<ResizeSession | null>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const [detailsRatio, setDetailsRatio] = useState(0.3);
  const [isResizing, setIsResizing] = useState(false);
  const availableWidth = Math.max(0, workspaceWidth - TASK_PANEL_GAP);
  const detailsWidth = availableWidth ? clampDetailsWidth(availableWidth * detailsRatio, availableWidth) : 360;

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const observer = new ResizeObserver(() => setWorkspaceWidth(workspace.getBoundingClientRect().width));
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || !workspaceRef.current) return;
    const width = Math.max(0, workspaceRef.current.getBoundingClientRect().width - TASK_PANEL_GAP);
    if (!width) return;
    const panel = workspaceRef.current.querySelector<HTMLElement>(".task-details-panel");
    resizeSession.current = {
      pointerId: event.pointerId, startX: event.clientX,
      detailsWidth: panel?.getBoundingClientRect().width ?? detailsWidth,
      availableWidth: width,
    };
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizing(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const session = resizeSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    // 往左拖动会增加右侧详情宽度；保留比例以适应后续窗口大小变化。
    const width = session.detailsWidth - (event.clientX - session.startX);
    setDetailsRatio(clampDetailsWidth(width, session.availableWidth) / session.availableWidth);
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (resizeSession.current?.pointerId !== event.pointerId) return;
    resizeSession.current = null;
    setIsResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!availableWidth || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const nextWidth = detailsWidth + (event.key === "ArrowLeft" ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP);
    setDetailsRatio(clampDetailsWidth(nextWidth, availableWidth) / availableWidth);
  }

  return {
    workspaceRef, detailsWidth, isResizing,
    boardPercentage: availableWidth ? Math.round((1 - detailsWidth / availableWidth) * 100) : 70,
    separatorHandlers: {
      onPointerDown: handlePointerDown, onPointerMove: handlePointerMove,
      onPointerUp: handlePointerEnd, onPointerCancel: handlePointerEnd,
      onLostPointerCapture: () => { resizeSession.current = null; setIsResizing(false); },
      onKeyDown: handleKeyDown,
    },
  };
}
