import { Button } from "@/components/ui/button";
import type { CompareMode, ReviewBatchFileAction } from "@/domain/types";
import { Minus, Plus, Undo2 } from "lucide-react";
import type { ReactNode } from "react";

interface DiffBatchActionBarProps {
  /** 当前对比方式；只有未暂存和已暂存模式需要展示批量操作。 */
  compareMode: CompareMode;
  /** 当前 diff 是否存在文件；为空时不展示悬浮条。 */
  hasFiles: boolean;
  /** 点击悬浮条按钮时执行批量 Git 文件操作。 */
  onBatchFileAction: (action: ReviewBatchFileAction) => void;
}

export function DiffBatchActionBar({ compareMode, hasFiles, onBatchFileAction }: DiffBatchActionBarProps) {
  if (!hasFiles || (compareMode !== "unstaged" && compareMode !== "staged")) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center">
      <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full border bg-background/92 px-1.5 text-muted-foreground shadow-lg backdrop-blur-xl">
        {compareMode === "unstaged" ? (
          <>
            <BatchActionButton label="还原全部" onClick={() => onBatchFileAction("restore-worktree-all")}>
              <Undo2 className="size-4" />
            </BatchActionButton>
            <BatchActionButton label="暂存全部" onClick={() => onBatchFileAction("stage-all")}>
              <Plus className="size-4" />
            </BatchActionButton>
          </>
        ) : (
          <BatchActionButton label="对全部取消暂存" onClick={() => onBatchFileAction("unstage-all")}>
            <Minus className="size-4" />
          </BatchActionButton>
        )}
      </div>
    </div>
  );
}

interface BatchActionButtonProps {
  /** 按钮文字，需准确描述批量操作。 */
  label: string;
  /** 按钮左侧图标。 */
  children: ReactNode;
  /** 点击时触发对应批量动作。 */
  onClick: () => void;
}

function BatchActionButton({ children, label, onClick }: BatchActionButtonProps) {
  return (
    <Button
      className="gap-1.5 rounded-full px-2.5 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
      size="default"
      type="button"
      variant="ghost"
      onClick={onClick}
    >
      {children}
      <span>{label}</span>
    </Button>
  );
}
