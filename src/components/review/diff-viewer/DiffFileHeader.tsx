import { IconTooltip } from "@/components/ui/icon-tooltip";
import type { CompareMode, DiffFile } from "@/domain/types";
import classNames from "classnames";
import { ChevronDown, Minus, Plus, Undo2 } from "lucide-react";
import type { KeyboardEvent } from "react";

interface DiffFileHeaderProps {
  /** 当前文件是否折叠，用于箭头方向和 Pierre 文件内容展示。 */
  collapsed: boolean;
  /** 当前对比方式，决定是否展示暂存/取消暂存文件按钮。 */
  compareMode: CompareMode;
  /** 文件级 diff 摘要，用于路径和增删数量展示。 */
  file: DiffFile;
  /** 点击文件头整行时切换折叠状态。 */
  onToggle: () => void;
}

export function DiffFileHeader({ collapsed, compareMode, file, onToggle }: DiffFileHeaderProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    onToggle();
  }

  return (
    <div
      className="flex min-h-9 w-full cursor-default items-center justify-between gap-4 bg-background pr-5.5 pl-2 text-left transition-colors hover:bg-muted/45"
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ChevronDown
            className={classNames("size-4 transition-transform duration-150", !collapsed && "-rotate-180")}
          />
        </span>
        <span className="truncate text-sm">{file.displayPath}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs">
        <FileHeaderActions compareMode={compareMode} />
        <span className="text-green-600 dark:text-green-400">+{file.additions}</span>
        <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
      </div>
    </div>
  );
}

interface FileHeaderActionsProps {
  /** 仅未暂存和已暂存模式展示文件级 Git 操作。 */
  compareMode: CompareMode;
}

function FileHeaderActions({ compareMode }: FileHeaderActionsProps) {
  if (compareMode !== "staged" && compareMode !== "unstaged") {
    return null;
  }

  const secondaryActionLabel = compareMode === "staged" ? "取消暂存文件" : "暂存文件";
  const SecondaryIcon = compareMode === "staged" ? Minus : Plus;

  return (
    <span
      className="mr-1 flex items-center gap-1.5 opacity-0 transition-opacity group-hover/file:opacity-100"
      onClick={(event) => event.stopPropagation()}
    >
      <IconTooltip className="size-7" label="还原文件">
        <Undo2 className="size-4" />
      </IconTooltip>
      <IconTooltip className="size-7" label={secondaryActionLabel}>
        <SecondaryIcon className="size-4" />
      </IconTooltip>
    </span>
  );
}
