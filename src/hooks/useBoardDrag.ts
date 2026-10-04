import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { PointerEvent as ReactPointerEvent } from "react";

const DRAG_THRESHOLD = 4;
const DROP_DURATION = 0.18;
const SCROLL_EDGE = 36;
const SCROLL_STEP = 8;

export interface BoardDropTarget {
  /** 放下卡片后所属的分组。 */
  group: string;
  /** 插入到此条目之前；null 表示列末尾。 */
  beforeItemId: string | null;
}

export interface BoardDragPreview<Item> {
  /** 浮动卡片展示的条目信息。 */
  item: Item;
  /** 浮动卡片相对于视口的位置。 */
  left: number;
  top: number;
  /** 原卡片尺寸，同时用于占位框。 */
  width: number;
  height: number;
  /** 松手后先完成落位动画，再提交顺序变化。 */
  settling: boolean;
}

interface DragSession<Item> {
  pointerId: number;
  board: HTMLElement;
  item: Item;
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
  target: BoardDropTarget;
  sourceGroup: string;
  allowCrossGroup: boolean;
}

interface UseBoardDragOptions<Item> {
  /** 当前条目集合，拖拽期间不预先修改条目状态或排序。 */
  items: Item[];
  /** 提取卡片所属分组；不假定业务状态就是分组。 */
  getGroup: (item: Item) => string;
  /** 默认允许跨组，类型不可转换的看板需禁止跨组。 */
  allowCrossGroup?: boolean;
  /** 落位动画结束后提交目标分组和排列位置。 */
  onMove: (itemId: string, target: BoardDropTarget) => void;
  /** 未达到拖拽阈值的点按用于打开条目详情。 */
  onItemClick: (itemId: string) => void;
}

function findColumn<Item>(session: DragSession<Item>): HTMLElement | null {
  const column = document.elementFromPoint(session.clientX, session.clientY)?.closest<HTMLElement>("[data-board-group]");
  return column && session.board.contains(column)
    && (session.allowCrossGroup || column.dataset.boardGroup === session.sourceGroup) ? column : null;
}

function resolveDropTarget<Item>(session: DragSession<Item>, column: HTMLElement): BoardDropTarget {
  const content = column.querySelector<HTMLElement>("[data-board-content]");
  if (!content) return session.target;
  const contentTop = content.getBoundingClientRect().top - content.scrollTop;
  const group = column.dataset.boardGroup ?? session.target.group;
  const placeholder = content.querySelector<HTMLElement>("[data-board-placeholder]");
  if (placeholder && session.target.group === group) {
    const top = contentTop + placeholder.offsetTop;
    if (session.clientY >= top && session.clientY <= top + placeholder.offsetHeight) return session.target;
  }

  // 用实际布局位置判断插入点，不读取动画中的 transform，避免让位动画反过来干扰排序。
  const cards = Array.from(content.querySelectorAll<HTMLElement>("[data-board-item]"));
  const nextCard = cards.find((card) => session.clientY < contentTop + card.offsetTop + card.offsetHeight / 2);
  return { group, beforeItemId: nextCard?.dataset.boardItem ?? null };
}

export function useBoardDrag<Item extends { id: string }>({ items, getGroup, allowCrossGroup = true, onMove, onItemClick }: UseBoardDragOptions<Item>) {
  const [dragPreview, setDragPreview] = useState<BoardDragPreview<Item> | null>(null);
  const [dropTarget, setDropTarget] = useState<BoardDropTarget | null>(null);
  const sessionRef = useRef<DragSession<Item> | null>(null);
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

  function updateTarget(session: DragSession<Item>) {
    const column = findColumn(session);
    if (!column) return;
    const target = resolveDropTarget(session, column);
    session.target = target;
    setDropTarget((current) => current?.group === target.group && current.beforeItemId === target.beforeItemId ? current : target);
  }

  function autoScroll() {
    const session = sessionRef.current;
    if (!session?.active || session.settling) return;
    const content = findColumn(session)?.querySelector<HTMLElement>("[data-board-content]");
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
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-board-item]");
    const item = items.find((item) => item.id === card?.dataset.boardItem);
    if (!card || !item) return;
    const bounds = card.getBoundingClientRect();
    const columnItems = items.filter((candidate) => getGroup(candidate) === getGroup(item));
    const itemIndex = columnItems.findIndex((item) => item.id === item.id);
    sessionRef.current = {
      pointerId: event.pointerId, board: event.currentTarget, item,
      sourceGroup: getGroup(item), allowCrossGroup,
      startX: event.clientX, startY: event.clientY, clientX: event.clientX, clientY: event.clientY,
      offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top,
      width: bounds.width, height: bounds.height, active: false, settling: false,
      target: { group: getGroup(item), beforeItemId: columnItems[itemIndex + 1]?.id ?? null },
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
      item: session.item, left: event.clientX - session.offsetX, top: event.clientY - session.offsetY,
      width: session.width, height: session.height, settling: false,
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId || session.settling) return;
    session.clientX = event.clientX;
    session.clientY = event.clientY;
    if (!session.active) {
      const card = Array.from(session.board.querySelectorAll<HTMLElement>("[data-board-item]")).find((item) => item.dataset.boardItem === session.item.id);
      const bounds = card?.getBoundingClientRect();
      const releasedOnCard = bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      resetDrag();
      if (releasedOnCard) onItemClick(session.item.id);
      return;
    }
    if (!findColumn(session)) { resetDrag(); return; }
    updateTarget(session);
    const placeholder = session.board.querySelector<HTMLElement>("[data-board-placeholder]");
    if (!placeholder) { resetDrag(); return; }
    const bounds = placeholder.getBoundingClientRect();
    session.settling = true;
    stopScrolling();
    setDragPreview({ item: session.item, left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, settling: true });
    if (session.board.hasPointerCapture(session.pointerId)) session.board.releasePointerCapture(session.pointerId);
    dropTimer.current = window.setTimeout(() => {
      onMove(session.item.id, session.target);
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
