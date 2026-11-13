import { useTranslation } from "react-i18next";
import type { DiffFile } from "@/domain/types";
import { Code2 } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { copyFilePath, getFullPath, openFileInVsCode } from "./filePathActions";

interface FileContextMenuProps {
  /** 触发右键菜单的文件树节点或 diff 文件块。 */
  children: ReactNode;
  /** 当前文件信息，用于展示和执行文件路径相关操作。 */
  file: DiffFile;
  /** 当前项目根路径，用于拼接完整文件路径。 */
  projectPath: string;
  /** diff 文件块需要额外展示相对路径和自动换行选项。 */
  showWrapToggle?: boolean;
  /** 当前自动换行状态，用于右键菜单文案互切。 */
  wrapDiffLines?: boolean;
  /** 点击自动换行选项时触发，仅在 showWrapToggle 为 true 时需要。 */
  onToggleWrap?: () => void;
}

interface MenuPosition {
  /** 菜单左上角距离视口左侧的像素坐标。 */
  x: number;
  /** 菜单左上角距离视口顶部的像素坐标。 */
  y: number;
}

interface FileActionMenuContentProps {
  /** 当前文件信息，用于展示和执行文件路径相关操作。 */
  file: DiffFile;
  /** 当前项目根路径，用于拼接完整文件路径。 */
  projectPath: string;
  /** 关闭右键菜单。 */
  onClose: () => void;
  /** diff 文件块需要额外展示相对路径和自动换行选项。 */
  showWrapToggle?: boolean;
  /** 当前自动换行状态，用于右键菜单文案互切。 */
  wrapDiffLines?: boolean;
  /** 点击自动换行选项时触发，仅在 showWrapToggle 为 true 时需要。 */
  onToggleWrap?: () => void;
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
            <FileActionMenuContent
              file={file}
              projectPath={projectPath}
              showWrapToggle={showWrapToggle}
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

export function FileActionMenuContent({
  file,
  projectPath,
  showWrapToggle = false,
  wrapDiffLines = false,
  onClose,
  onToggleWrap,
}: FileActionMenuContentProps) {
  const { t: translate } = useTranslation(["common", "review"]);
  const fullPath = getFullPath(projectPath, file.displayPath);

  function runMenuAction(action: () => void) {
    action();
    onClose();
  }

  return (
    <>
      <button
        className={fileActionItemClassName}
        type="button"
        onClick={() => runMenuAction(() => openFileInVsCode(projectPath, file.displayPath))}
      >
        <Code2 className={fileActionIconClassName} />
        <span>{translate("review:files.openInEditor")}</span>
      </button>
      <div className="mx-2 my-1 h-px bg-border" />
      <button className={fileActionItemClassName} type="button" onClick={() => runMenuAction(() => copyFilePath(fullPath))}>
        <span>{translate("common:actions.copyPath")}</span>
      </button>
      {showWrapToggle && (
        <>
          <button
            className={fileActionItemClassName}
            type="button"
            onClick={() => runMenuAction(() => copyFilePath(file.displayPath))}
          >
            <span>{translate("review:files.copyRelativePath")}</span>
          </button>
          <button className={fileActionItemClassName} type="button" onClick={() => runMenuAction(() => onToggleWrap?.())}>
            <span>{wrapDiffLines ? translate("review:diff.disableWordWrap") : translate("review:diff.enableWordWrap")}</span>
          </button>
        </>
      )}
    </>
  );
}

export function getMenuPosition(clientX: number, clientY: number, showWrapToggle: boolean): MenuPosition {
  const menuHeight = showWrapToggle ? diffMenuHeight : baseMenuHeight;
  const maxX = window.innerWidth - menuWidth - viewportPadding;
  const maxY = window.innerHeight - menuHeight - viewportPadding;

  // 右键菜单根据每次点击位置重新计算，同时限制在视口内，避免重复右击时沿用旧坐标。
  return {
    x: Math.max(viewportPadding, Math.min(clientX, maxX)),
    y: Math.max(viewportPadding, Math.min(clientY, maxY)),
  };
}

const fileActionItemClassName =
  "flex w-full cursor-default items-center gap-1.5 rounded-sm px-2 py-1 text-left text-xs outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground";
const fileActionIconClassName = "size-3.5 text-muted-foreground";
