import type { KeyboardEvent, PointerEvent } from "react";
import { useState } from "react";

interface WorkspaceSeparatorProps {
  /** 当前面板尺寸，以像素传递，便于键盘步进。 */
  value: number;
  min: number;
  max: number;
  label: string;
  vertical?: boolean;
  /** 增量方向由宿主决定，组件仅负责指针捕获。 */
  onDelta: (delta: number) => void;
}
export function WorkspaceSeparator({ value, min, max, label, vertical, onDelta }: WorkspaceSeparatorProps) {
  const [resizing, setResizing] = useState(false);
  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) onDelta(vertical ? event.movementY : event.movementX);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const keys = vertical ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
    if (keys.includes(event.key)) { event.preventDefault(); onDelta(event.key === keys[0] ? -16 : 16); }
  }
  return <div className="task-workbench-separator panel-resize-handle" data-vertical={vertical} data-resize-axis={vertical ? "y" : "x"} data-resizing={resizing} role="separator" tabIndex={0} aria-label={label}
    aria-orientation={vertical ? "horizontal" : "vertical"} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)}
    onPointerDown={(event) => { if (event.button === 0) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); } }}
    onGotPointerCapture={() => setResizing(true)} onLostPointerCapture={() => setResizing(false)}
    onPointerMove={move} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onKeyDown={keyboard} />;
}
