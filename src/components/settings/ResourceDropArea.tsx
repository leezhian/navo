import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface ResourceDropAreaProps {
  /** 正在保存或选择目录时，不接受拖入。 */
  disabled: boolean;
  /** 打开系统目录选择器。 */
  onChooseFolder: () => void;
  /** 松开后交给表单校验目录并导入，不在悬停时访问文件系统。 */
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}

export function ResourceDropArea({ disabled, onChooseFolder, onDrop }: ResourceDropAreaProps) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const active = dragging && !disabled;

  function resetDrag() {
    dragDepth.current = 0;
    setDragging(false);
  }

  useEffect(() => {
    if (disabled) resetDrag();
  }, [disabled]);

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled || !event.dataTransfer.types.includes("Files")) return;
    // 进入提示文字或按钮也会触发 enter/leave，计数避免区域高亮反复闪烁。
    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  return <div className="resource-drop-area" data-disabled={disabled} data-drag-active={active}
    onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragEnd={resetDrag}
    onDragOver={(event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = !disabled && event.dataTransfer.types.includes("Files") ? "copy" : "none";
    }}
    onDrop={(event) => {
      event.preventDefault();
      resetDrag();
      if (!disabled && event.dataTransfer.types.includes("Files")) onDrop(event);
    }}>
    <p className="text-xs leading-5 text-muted-foreground" aria-live="polite">{t(active ? "松开以添加目录" : "拖入目录，或选择已有本地文件夹。")}</p>
    <Button type="button" className="mt-2 h-8 text-xs" variant="secondary" disabled={disabled} onClick={onChooseFolder}>{t("选择本地文件夹")}</Button>
  </div>;
}
