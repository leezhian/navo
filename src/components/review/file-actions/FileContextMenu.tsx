import type { DiffFile } from "@/domain/types";
import { Code2 } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { copyFilePath, getFullPath, openFileInVsCode } from "./filePathActions";

interface FileContextMenuProps {
  children: ReactNode;
  file: DiffFile;
  projectPath: string;
  showWrapToggle?: boolean;
  wrapDiffLines?: boolean;
  onToggleWrap?: () => void;
}

interface MenuPosition {
  x: number;
  y: number;
}

const menuWidth = 176;
const baseMenuHeight = 76;
const diffMenuHeight = 148;
const viewportPadding = 8;

export function FileContextMenu({
  children,
  file,
  projectPath,
  showWrapToggle = false,
  wrapDiffLines = false,
  onToggleWrap,
}: FileContextMenuProps) {
  const fullPath = getFullPath(projectPath, file.displayPath);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  function openMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    setMenuPosition(getMenuPosition(event.clientX, event.clientY, showWrapToggle));
  }

  function closeMenu() {
    setMenuPosition(null);
  }

  function runMenuAction(action: () => void) {
    action();
    closeMenu();
  }

  useEffect(() => {
    if (!menuPosition) {
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
  }, [menuPosition]);

  return (
    <div className="contents" onContextMenu={openMenu}>
      {children}
      {menuPosition &&
        createPortal(
          <div
            className="fixed z-50 w-44 overflow-hidden rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
            ref={menuRef}
            style={{ left: menuPosition.x, top: menuPosition.y }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              className={fileActionItemClassName}
              type="button"
              onClick={() => runMenuAction(() => openFileInVsCode(projectPath, file.displayPath))}
            >
              <Code2 className={fileActionIconClassName} />
              <span>在 VS Code 中打开</span>
            </button>
            <div className="mx-2 my-1 h-px bg-border" />
            <button
              className={fileActionItemClassName}
              type="button"
              onClick={() => runMenuAction(() => copyFilePath(fullPath))}
            >
              <span>复制路径</span>
            </button>
            {showWrapToggle && (
              <>
                <button
                  className={fileActionItemClassName}
                  type="button"
                  onClick={() => runMenuAction(() => copyFilePath(file.displayPath))}
                >
                  <span>复制相对路径</span>
                </button>
                <button
                  className={fileActionItemClassName}
                  type="button"
                  onClick={() => runMenuAction(() => onToggleWrap?.())}
                >
                  <span>{wrapDiffLines ? "关闭自动换行" : "开启自动换行"}</span>
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

function getMenuPosition(clientX: number, clientY: number, showWrapToggle: boolean): MenuPosition {
  const menuHeight = showWrapToggle ? diffMenuHeight : baseMenuHeight;
  const maxX = window.innerWidth - menuWidth - viewportPadding;
  const maxY = window.innerHeight - menuHeight - viewportPadding;

  return {
    x: Math.max(viewportPadding, Math.min(clientX, maxX)),
    y: Math.max(viewportPadding, Math.min(clientY, maxY)),
  };
}

const fileActionItemClassName =
  "flex w-full cursor-default items-center gap-1.5 rounded-sm px-2 py-1 text-left text-xs outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground";
const fileActionIconClassName = "size-3.5 text-muted-foreground";
