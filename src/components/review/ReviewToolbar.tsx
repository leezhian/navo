import { IconTooltip } from "@/components/ui/icon-tooltip";
import type { AppSettings, CompareMode, CompareModeFileCounts, ReviewSession, ReviewSummary } from "@/domain/types";
import { FolderClosed, FolderOpen, Rows3, SplitSquareHorizontal } from "lucide-react";
import { useState } from "react";
import { BranchMenu } from "./review-toolbar/BranchMenu";
import { CompareModeMenu } from "./review-toolbar/CompareModeMenu";
import { toggleDiffView } from "./review-toolbar/settingsActions";
import { ViewOptionsMenu } from "./review-toolbar/ViewOptionsMenu";

interface ReviewToolbarProps {
  /** 当前对比方式，驱动对比方式选择器和分支选择区域是否展示。 */
  compareMode: CompareMode;
  /** 未暂存/已暂存文件数角标数据。 */
  compareModeFileCounts: CompareModeFileCounts;
  /** 当前所有文件是否都处于折叠状态，用于查看选项文案互切。 */
  isAllCollapsed: boolean;
  /** 文件树面板是否显示，用于按钮图标和激活态。 */
  isFileTreeVisible: boolean;
  /** 当前项目的本地分支候选项。 */
  localBranches: string[];
  /** 当前会话，用于展示源分支和兜底增删统计。 */
  session: ReviewSession;
  /** 本地展示设置，提供目标分支、视图模式和换行状态。 */
  settings: AppSettings;
  /** 当前 diff 汇总，优先用于展示最新增删统计。 */
  summary: ReviewSummary | null;
  /** 选择新的对比方式后通知上层重新加载 diff。 */
  onCompareModeChange: (mode: CompareMode) => void;
  /** 更新本地展示设置，例如目标分支或差异视图。 */
  onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
  /** 查看选项中触发全部折叠/全部展开。 */
  onToggleAllCollapsed: () => void;
  /** 显示或隐藏右侧文件树面板。 */
  onToggleFileTree: () => void;
}

export function ReviewToolbar({
  compareMode,
  compareModeFileCounts,
  isAllCollapsed,
  isFileTreeVisible,
  localBranches,
  session,
  settings,
  summary,
  onCompareModeChange,
  onSettingsChange,
  onToggleAllCollapsed,
  onToggleFileTree,
}: ReviewToolbarProps) {
  const [branchSearch, setBranchSearch] = useState("");
  const branchOptions = localBranches.filter((branch) =>
    branch.toLowerCase().includes(branchSearch.trim().toLowerCase()),
  );

  return (
    <header className="border-b bg-background pt-12">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-5 pb-2.5">
        <div>
          <div className="flex min-h-7 flex-wrap items-center gap-3 text-sm">
            <CompareModeMenu
              compareMode={compareMode}
              fileCounts={compareModeFileCounts}
              onCompareModeChange={onCompareModeChange}
            />
            <span className="text-green-600 dark:text-green-400">+{summary?.additions ?? session.additions}</span>
            <span className="text-red-600 dark:text-red-400">-{summary?.deletions ?? session.deletions}</span>
          </div>

          {compareMode === "branch" && (
            <div className="mt-2 flex items-center gap-3 text-sm leading-6 text-muted-foreground">
              <span className="inline-flex h-6 items-center">{session.branchName}</span>
              <span className="inline-flex h-6 items-center">→</span>
              <BranchMenu
                branchOptions={branchOptions}
                branchSearch={branchSearch}
                settings={settings}
                onSearchChange={setBranchSearch}
                onSettingsChange={onSettingsChange}
              />
            </div>
          )}
        </div>

        <div className="flex items-start gap-2">
          <ViewOptionsMenu
            isAllCollapsed={isAllCollapsed}
            settings={settings}
            onSettingsChange={onSettingsChange}
            onToggleAllCollapsed={onToggleAllCollapsed}
          />
          <IconTooltip
            label={settings.diffViewMode === "split" ? "切换到统一视图" : "切换到分栏视图"}
            onClick={() => toggleDiffView(onSettingsChange)}
          >
            {settings.diffViewMode === "split" ? (
              <Rows3 className="size-4" />
            ) : (
              <SplitSquareHorizontal className="size-4" />
            )}
          </IconTooltip>
          <IconTooltip
            className={isFileTreeVisible ? "bg-muted text-foreground" : undefined}
            label={isFileTreeVisible ? "隐藏文件树" : "显示文件树"}
            onClick={onToggleFileTree}
          >
            {isFileTreeVisible ? <FolderOpen className="size-4" /> : <FolderClosed className="size-4" />}
          </IconTooltip>
        </div>
      </div>
    </header>
  );
}
