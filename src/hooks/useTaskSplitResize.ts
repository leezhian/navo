import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { TaskSplit } from "@/domain/taskSplit";

const GAP = 8;
const KEYBOARD_STEP = 24;

/** 双任务视图使用对称尺寸约束，不改变任务看板侧栏的默认宽度规则。 */
export function useTaskSplitResize(split: TaskSplit | undefined, onRatioChange: (id: string, ratio: number) => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const session = useRef<{ pointerId: number; start: number; ratio: number; extent: number; splitId: string } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [resizing, setResizing] = useState(false);
  const vertical = split?.orientation === "vertical";
  const extent = Math.max(0, (vertical ? size.height : size.width) - GAP);
  const minimum = extent ? Math.min(vertical ? 180 : 280, extent / 2) / extent : 0.5;
  const clamp = (ratio: number) => Math.max(minimum, Math.min(1 - minimum, ratio));
  const ratio = clamp(split?.ratios[split.orientation] ?? 0.5);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const rect = node.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function end(event: PointerEvent<HTMLDivElement>) {
    session.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return {
    containerRef, ratio, resizing,
    separatorHandlers: {
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (!split || !extent || event.button !== 0 || !event.isPrimary) return;
        session.current = { pointerId: event.pointerId, start: vertical ? event.clientY : event.clientX, ratio, extent, splitId: split.id };
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        setResizing(true);
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const current = session.current;
        if (!current || current.pointerId !== event.pointerId || current.splitId !== split?.id) return;
        onRatioChange(current.splitId, clamp(current.ratio + ((vertical ? event.clientY : event.clientX) - current.start) / current.extent));
      },
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: () => { session.current = null; setResizing(false); },
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (!split || !extent) return;
        const previous = vertical ? "ArrowUp" : "ArrowLeft";
        const next = vertical ? "ArrowDown" : "ArrowRight";
        if (event.key !== previous && event.key !== next) return;
        event.preventDefault();
        onRatioChange(split.id, clamp(ratio + (event.key === next ? KEYBOARD_STEP : -KEYBOARD_STEP) / extent));
      },
    },
  };
}
