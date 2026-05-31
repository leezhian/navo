import { IconTooltip } from "@/components/ui/icon-tooltip";
import type { CompareMode, DiffFile } from "@/domain/types";
import classNames from "classnames";
import { ChevronDown, Minus, Plus, Undo2 } from "lucide-react";
import type { KeyboardEvent } from "react";

interface DiffFileHeaderProps {
  collapsed: boolean;
  compareMode: CompareMode;
  file: DiffFile;
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
      className="sticky top-0 z-20 flex min-h-9 w-full cursor-default items-center justify-between gap-4 bg-background px-5.5 text-left"
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
    >
      <div className="flex min-w-0 items-center gap-2">
        <ChevronDown
          className={classNames("size-4 shrink-0 transition-transform duration-150", !collapsed && "-rotate-180")}
        />
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

function FileHeaderActions({ compareMode }: { compareMode: CompareMode }) {
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
