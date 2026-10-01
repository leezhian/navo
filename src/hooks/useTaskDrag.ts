import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Task, TaskStatus } from "@/domain/tasks";

const DRAG_THRESHOLD = 4;
const DROP_DURATION = 0.18;
const SCROLL_EDGE = 36;
const SCROLL_STEP = 8;

export interface TaskDropTarget {
  /** 放下卡片后所属的状态列。 */
  status: TaskStatus;
  /** 插入到此任务之前；null 表示列末尾。 */
  beforeTaskId: string | null;
}

export interface TaskDragPreview {
  /** 浮动卡片展示的任务信息。 */
  task: Task;
  /** 浮动卡片相对于视口的位置。 */
  left: number;
  top: number;
  /** 原卡片尺寸，同时用于占位框。 */
  width: number;
  height: number;
  /** 松手后先完成落位动画，再提交顺序变化。 */
  settling: boolean;
}

interface DragSession {
  pointerId: number;
  board: HTMLElement;
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
  target: TaskDropTarget;
}

interface UseTaskDragOptions {
  /** 当前任务集合，拖拽期间不预先修改任务状态或排序。 */
  tasks: Task[];
  /** 落位动画结束后提交目标状态和排列位置。 */
  onMove: (taskId: string, target: TaskDropTarget) => void;
  /** 未达到拖拽阈值的点按用于打开任务详情。 */
  onTaskClick: (taskId: string) => void;
}

function findColumn(session: DragSession): HTMLElement | null {
  const column = document.elementFromPoint(session.clientX, session.clientY)?.closest<HTMLElement>(".task-column");
  return column && session.board.contains(column) ? column : null;
}

function resolveDropTarget(session: DragSession, column: HTMLElement): TaskDropTarget {
  const content = column.querySelector<HTMLElement>(".task-column-content");
  if (!content) return session.target;
  const contentTop = content.getBoundingClientRect().top - content.scrollTop;
  const status = column.dataset.status as TaskStatus;
  const placeholder = content.querySelector<HTMLElement>(".task-drop-placeholder");
  if (placeholder && session.target.status === status) {
    const top = contentTop + placeholder.offsetTop;
    if (session.clientY >= top && session.clientY <= top + placeholder.offsetHeight) return session.target;
  }

  // 用实际布局位置判断插入点，不读取动画中的 transform，避免让位动画反过来干扰排序。
  const cards = Array.from(content.querySelectorAll<HTMLElement>(".task-card-slot"));
  const nextCard = cards.find((card) => session.clientY < contentTop + card.offsetTop + card.offsetHeight / 2);
  return { status, beforeTaskId: nextCard?.dataset.taskId ?? null };
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
    if (session?.board.hasPointerCapture(session.pointerId)) session.board.releasePointerCapture(session.pointerId);
    setDragPreview(null);
    setDropTarget(null);
  }

  useEffect(() => {
    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session?.board.hasPointerCapture(session.pointerId)) session.board.releasePointerCapture(session.pointerId);
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
    const column = findColumn(session);
    if (!column) return;
    const target = resolveDropTarget(session, column);
    session.target = target;
    setDropTarget((current) => current?.status === target.status && current.beforeTaskId === target.beforeTaskId ? current : target);
  }

  function autoScroll() {
    const session = sessionRef.current;
    if (!session?.active || session.settling) return;
    const content = findColumn(session)?.querySelector<HTMLElement>(".task-column-content");
    if (content) {
      const bounds = content.getBoundingClientRect();
      const direction = session.clientY < bounds.top + SCROLL_EDGE ? -1 : session.clientY > bounds.bottom - SCROLL_EDGE ? 1 : 0;
      if (direction) content.scrollTop += direction * SCROLL_STEP;
    }
    const boardBounds = session.board.getBoundingClientRect();
    const horizontalDirection = session.clientX < boardBounds.left + SCROLL_EDGE ? -1 : session.clientX > boardBounds.right - SCROLL_EDGE ? 1 : 0;
    if (horizontalDirection) session.board.scrollLeft += horizontalDirection * SCROLL_STEP;
    updateTarget(session);
    scrollFrame.current = window.requestAnimationFrame(autoScroll);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || sessionRef.current) return;
    const card = (event.target as HTMLElement).closest<HTMLElement>(".task-card-slot");
    const task = tasks.find((item) => item.id === card?.dataset.taskId);
    if (!card || !task) return;
    const bounds = card.getBoundingClientRect();
    const columnTasks = tasks.filter((item) => item.status === task.status);
    const taskIndex = columnTasks.findIndex((item) => item.id === task.id);
    sessionRef.current = {
      pointerId: event.pointerId, board: event.currentTarget, task,
      startX: event.clientX, startY: event.clientY, clientX: event.clientX, clientY: event.clientY,
      offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top,
      width: bounds.width, height: bounds.height, active: false, settling: false,
      target: { status: task.status, beforeTaskId: columnTasks[taskIndex + 1]?.id ?? null },
    };
    // 捕获到稳定的看板节点，卡片移出原列也不会中断拖动。
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
      setDropTarget(session.target);
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
      const card = Array.from(session.board.querySelectorAll<HTMLElement>(".task-card-slot")).find((item) => item.dataset.taskId === session.task.id);
      const bounds = card?.getBoundingClientRect();
      const releasedOnCard = bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      resetDrag();
      if (releasedOnCard) onTaskClick(session.task.id);
      return;
    }
    if (!findColumn(session)) { resetDrag(); return; }
    updateTarget(session);
    const placeholder = session.board.querySelector<HTMLElement>(".task-drop-placeholder");
    if (!placeholder) { resetDrag(); return; }
    const bounds = placeholder.getBoundingClientRect();
    session.settling = true;
    stopScrolling();
    setDragPreview({ task: session.task, left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, settling: true });
    if (session.board.hasPointerCapture(session.pointerId)) session.board.releasePointerCapture(session.pointerId);
    dropTimer.current = window.setTimeout(() => {
      onMove(session.task.id, session.target);
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
