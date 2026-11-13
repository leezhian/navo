import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Task, TaskStatus } from "@/domain/tasks";
import type { TaskDropTarget } from "@/domain/taskView";
import { getTaskStatusDropTarget } from "@/utils/taskView";

export type { TaskDropTarget } from "@/domain/taskView";

const DRAG_THRESHOLD = 4;
const DROP_DURATION = 0.18;
const SCROLL_EDGE = 36;
const SCROLL_STEP = 8;

export interface TaskDragPreview {
  /** 浮动任务与原始尺寸，列表和看板共用状态切换手势。 */
  task: Task;
  left: number;
  top: number;
  width: number;
  height: number;
  /** 松手后浮动卡片淡出，再提交状态并按当前属性排序。 */
  settling: boolean;
}

interface DragSession {
  pointerId: number;
  root: HTMLElement;
  task: Task;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  active: boolean;
  settling: boolean;
}

interface UseTaskDragOptions {
  /** 当前可见任务，用于验证被拖动任务及其原状态。 */
  tasks: Task[];
  /** 仅在跨状态放下时调用，同组拖动和取消均不提交。 */
  onMove: (taskId: string, target: TaskDropTarget) => void;
  /** 未达到拖拽阈值的点按用于打开任务。 */
  onTaskClick: (taskId: string) => void;
}

function findGroup(session: DragSession): HTMLElement | null {
  const group = document.elementFromPoint(session.clientX, session.clientY)?.closest<HTMLElement>("[data-board-group]");
  return group && session.root.contains(group) ? group : null;
}

export function useTaskDrag({ tasks, onMove, onTaskClick }: UseTaskDragOptions) {
  const [dragPreview, setDragPreview] = useState<TaskDragPreview | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskDropTarget | null>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const dropTimer = useRef<number | null>(null);
  const scrollFrame = useRef<number | null>(null);
  const dropDuration = useReducedMotion() ? 0 : DROP_DURATION;

  function stopScrolling() {
    if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null;
  }

  function resetDrag() {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (dropTimer.current !== null) window.clearTimeout(dropTimer.current);
    dropTimer.current = null;
    stopScrolling();
    if (session?.root.hasPointerCapture(session.pointerId)) session.root.releasePointerCapture(session.pointerId);
    setDragPreview(null);
    setDropTarget(null);
  }

  useEffect(() => {
    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session?.root.hasPointerCapture(session.pointerId)) session.root.releasePointerCapture(session.pointerId);
      if (dropTimer.current !== null) window.clearTimeout(dropTimer.current);
      if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current);
      dropTimer.current = null;
      scrollFrame.current = null;
      setDragPreview(null);
      setDropTarget(null);
    }
    window.addEventListener("keydown", cancelOnEscape);
    return () => {
      window.removeEventListener("keydown", cancelOnEscape);
      if (dropTimer.current !== null) window.clearTimeout(dropTimer.current);
      if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current);
    };
  }, []);

  function updateTarget(session: DragSession) {
    const group = findGroup(session);
    const target = group ? getTaskStatusDropTarget(tasks, session.task.id, group.dataset.boardGroup as TaskStatus) : null;
    setDropTarget((current) => current?.status === target?.status ? current : target);
    return target;
  }

  function autoScroll() {
    const session = sessionRef.current;
    if (!session?.active || session.settling) return;
    const content = findGroup(session)?.querySelector<HTMLElement>("[data-board-content]");
    const scrollContainer = content && content.scrollHeight > content.clientHeight ? content : session.root;
    const bounds = scrollContainer.getBoundingClientRect();
    const direction = session.clientY < bounds.top + SCROLL_EDGE ? -1 : session.clientY > bounds.bottom - SCROLL_EDGE ? 1 : 0;
    if (direction) scrollContainer.scrollTop += direction * SCROLL_STEP;
    const rootBounds = session.root.getBoundingClientRect();
    const horizontalDirection = session.clientX < rootBounds.left + SCROLL_EDGE ? -1 : session.clientX > rootBounds.right - SCROLL_EDGE ? 1 : 0;
    if (horizontalDirection) session.root.scrollLeft += horizontalDirection * SCROLL_STEP;
    updateTarget(session);
    scrollFrame.current = window.requestAnimationFrame(autoScroll);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || sessionRef.current) return;
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-board-item]");
    const task = tasks.find((item) => item.id === card?.dataset.boardItem);
    if (!card || !task) return;
    const bounds = card.getBoundingClientRect();
    sessionRef.current = {
      pointerId: event.pointerId, root: event.currentTarget, task,
      startX: event.clientX, startY: event.clientY, clientX: event.clientX, clientY: event.clientY,
      offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top,
      width: bounds.width, height: bounds.height, active: false, settling: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId || session.settling) return;
    session.clientX = event.clientX;
    session.clientY = event.clientY;
    if (!session.active) {
      if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < DRAG_THRESHOLD) return;
      session.active = true;
      scrollFrame.current = window.requestAnimationFrame(autoScroll);
    }
    event.preventDefault();
    updateTarget(session);
    setDragPreview({
      task: session.task, left: event.clientX - session.offsetX, top: event.clientY - session.offsetY,
      width: session.width, height: session.height, settling: false,
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId || session.settling) return;
    session.clientX = event.clientX;
    session.clientY = event.clientY;
    if (!session.active) {
      const card = Array.from(session.root.querySelectorAll<HTMLElement>("[data-board-item]")).find((item) => item.dataset.boardItem === session.task.id);
      const bounds = card?.getBoundingClientRect();
      const releasedOnCard = bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      resetDrag();
      if (releasedOnCard) onTaskClick(session.task.id);
      return;
    }
    const target = updateTarget(session);
    if (!target) { resetDrag(); return; }
    session.settling = true;
    stopScrolling();
    setDragPreview({
      task: session.task, left: event.clientX - session.offsetX, top: event.clientY - session.offsetY,
      width: session.width, height: session.height, settling: true,
    });
    if (session.root.hasPointerCapture(session.pointerId)) session.root.releasePointerCapture(session.pointerId);
    dropTimer.current = window.setTimeout(() => {
      onMove(session.task.id, target);
      resetDrag();
    }, dropDuration * 1000);
  }

  return {
    dragPreview, dropTarget, dropDuration,
    pointerHandlers: {
      onPointerDown: handlePointerDown, onPointerMove: handlePointerMove, onPointerUp: handlePointerUp,
      onPointerCancel: resetDrag,
      onLostPointerCapture: () => { if (sessionRef.current && !sessionRef.current.settling) resetDrag(); },
    },
  };
}
