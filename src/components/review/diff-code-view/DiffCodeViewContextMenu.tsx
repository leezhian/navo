import type { DiffFile } from "@/domain/types";
import type { CodeViewHandle } from "@pierre/diffs/react";
import type { MouseEvent, ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LocalCommentMetadata } from "../diff-viewer/LineComment";
import { FileActionMenuContent, getMenuPosition } from "../file-actions/FileContextMenu";

interface DiffCodeViewContextMenuProps {
  /** CodeView 内容区域。 */
  children: ReactNode;
  /** 当前渲染的文件列表，用于从 CodeView item id 反查业务文件。 */
  files: DiffFile[];
  /** CodeView ref，用于读取当前已渲染 item 的 DOM 宿主。 */
  codeViewRef: RefObject<CodeViewHandle<LocalCommentMetadata> | null>;
  /** 当前项目根路径，用于文件操作菜单。 */
  projectPath: string;
  /** 当前自动换行状态，用于菜单文案互切。 */
  wrapDiffLines: boolean;
  /** 点击自动换行选项时切换全局 diff 设置。 */
  onToggleWrap: () => void;
}

interface ContextMenuState {
  /** 当前右键命中的文件。 */
  file: DiffFile;
  /** 菜单左上角距离视口左侧的像素坐标。 */
  x: number;
  /** 菜单左上角距离视口顶部的像素坐标。 */
  y: number;
}

const fileIdAttribute = "data-review-diff-file-id";

export function DiffCodeViewContextMenu({
  children,
  files,
  codeViewRef,
  projectPath,
  wrapDiffLines,
  onToggleWrap,
}: DiffCodeViewContextMenuProps) {
  const filesById = useMemo(() => new Map(files.map((file) => [file.id, file])), [files]);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuState, setMenuState] = useState<ContextMenuState | null>(null);

  function openMenu(event: MouseEvent<HTMLDivElement>) {
    const file = resolveContextFile(event, filesById, codeViewRef);

    if (!file) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const position = getMenuPosition(event.clientX, event.clientY, true);
    setMenuState({
      file,
      x: position.x,
      y: position.y,
    });
  }

  function closeMenu() {
    setMenuState(null);
  }

  useEffect(() => {
    if (!menuState) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      closeMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [menuState]);

  return (
    <div className="h-full min-h-0" onContextMenu={openMenu}>
      {children}
      {menuState &&
        createPortal(
          <div
            className="fixed z-50 w-44 overflow-hidden rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
            ref={menuRef}
            style={{ left: menuState.x, top: menuState.y }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <FileActionMenuContent
              file={menuState.file}
              projectPath={projectPath}
              showWrapToggle
              wrapDiffLines={wrapDiffLines}
              onClose={closeMenu}
              onToggleWrap={onToggleWrap}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

function resolveContextFile(
  event: MouseEvent,
  filesById: Map<string, DiffFile>,
  codeViewRef: RefObject<CodeViewHandle<LocalCommentMetadata> | null>,
) {
  const path = event.nativeEvent.composedPath();
  const fileFromPath = resolveFileFromEventPath(path, filesById);

  if (fileFromPath) {
    return fileFromPath;
  }

  const renderedItems = codeViewRef.current?.getInstance()?.getRenderedItems() ?? [];
  const renderedItem = renderedItems.find((item) => {
    const rect = item.element.getBoundingClientRect();
    return event.clientY >= rect.top && event.clientY <= rect.bottom;
  });

  return renderedItem ? filesById.get(renderedItem.id) : filesById.size === 1 ? [...filesById.values()][0] : null;
}

function resolveFileFromEventPath(path: EventTarget[], filesById: Map<string, DiffFile>) {
  for (const target of path) {
    if (!(target instanceof HTMLElement)) {
      continue;
    }

    const element = target.closest(`[${fileIdAttribute}]`);
    const fileId = element?.getAttribute(fileIdAttribute);

    if (fileId && filesById.has(fileId)) {
      return filesById.get(fileId);
    }
  }

  return null;
}

export function getDiffCodeViewFileIdAttribute(fileId: string) {
  return {
    [fileIdAttribute]: fileId,
  };
}
