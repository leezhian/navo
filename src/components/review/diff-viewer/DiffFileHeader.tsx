import { useTranslation } from "react-i18next";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import type { CompareMode, DiffFile, ReviewFileAction } from "@/domain/types";
import classNames from "classnames";
import { ChevronDown, Minus, Plus, Undo2 } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";

interface DiffFileHeaderProps {
  /** 当前文件是否折叠，用于箭头方向和 Pierre 文件内容展示。 */
  collapsed: boolean;
  /** 当前对比方式，决定是否展示暂存/取消暂存文件按钮。 */
  compareMode: CompareMode;
  /** 文件级 diff 摘要，用于路径和增删数量展示。 */
  file: DiffFile;
  /** 点击文件级操作按钮时执行 Git 文件操作。 */
  onFileAction: (filePath: string, action: ReviewFileAction) => void;
  /** 点击文件头整行时切换折叠状态。 */
  onToggle: () => void;
}

export function DiffFileHeader({ collapsed, compareMode, file, onFileAction, onToggle }: DiffFileHeaderProps) {
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
        <FileHeaderActions compareMode={compareMode} file={file} onFileAction={onFileAction} />
        <span className="text-green-600 dark:text-green-400">+{file.additions}</span>
        <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
      </div>
    </div>
  );
}

interface FileHeaderActionsProps {
  /** 仅未暂存和已暂存模式展示文件级 Git 操作。 */
  compareMode: CompareMode;
  /** 当前文件信息，用于选择 Git 操作使用的新路径或旧路径。 */
  file: DiffFile;
  /** 执行文件级 Git 操作。 */
  onFileAction: (filePath: string, action: ReviewFileAction) => void;
}

function FileHeaderActions({ compareMode, file, onFileAction }: FileHeaderActionsProps) {
  const { t: translate } = useTranslation(["common", "review"]);
  if (compareMode !== "staged" && compareMode !== "unstaged") {
    return null;
  }

  const secondaryActionLabel = compareMode === "staged" ? translate("review:files.unstage") : translate("review:files.stage");
  const SecondaryIcon = compareMode === "staged" ? Minus : Plus;
  const restoreAction: ReviewFileAction = compareMode === "staged" ? "restore-file" : "restore-worktree";
  const secondaryAction: ReviewFileAction = compareMode === "staged" ? "unstage" : "stage";
  const actionPath = file.newPath || file.oldPath || file.displayPath;

  function handleFileAction(event: MouseEvent<HTMLButtonElement>, action: ReviewFileAction) {
    event.stopPropagation();
    onFileAction(actionPath, action);
  }

  return (
    <span
      className="mr-1 flex items-center gap-1.5 opacity-0 transition-opacity group-hover/file:opacity-100"
      onClick={(event) => event.stopPropagation()}
    >
      <IconTooltip className="size-7" label={translate("review:files.restore")} onClick={(event) => handleFileAction(event, restoreAction)}>
        <Undo2 className="size-4" />
      </IconTooltip>
      <IconTooltip className="size-7" label={secondaryActionLabel} onClick={(event) => handleFileAction(event, secondaryAction)}>
        <SecondaryIcon className="size-4" />
      </IconTooltip>
    </span>
  );
}
