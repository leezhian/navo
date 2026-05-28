import { IconTooltip } from "@/components/ui/icon-tooltip";
import type { AppSettings, CompareMode, ReviewSession, ReviewSummary } from "@/domain/types";
import { Folder, Rows3, SplitSquareHorizontal, X } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { BranchMenu } from "./review-toolbar/BranchMenu";
import { CompareModeMenu } from "./review-toolbar/CompareModeMenu";
import { toggleDiffView } from "./review-toolbar/settingsActions";
import { ViewOptionsMenu } from "./review-toolbar/ViewOptionsMenu";

interface ReviewToolbarProps {
  compareMode: CompareMode;
  isAllCollapsed: boolean;
  isFileTreeVisible: boolean;
  localBranches: string[];
  session: ReviewSession;
  settings: AppSettings;
  summary: ReviewSummary | null;
  leadingControls?: ReactNode;
  onClose: () => void;
  onCompareModeChange: (mode: CompareMode) => void;
  onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
  onToggleAllCollapsed: () => void;
  onToggleFileTree: () => void;
}

export function ReviewToolbar({
  compareMode,
  isAllCollapsed,
  isFileTreeVisible,
  localBranches,
  session,
  settings,
  summary,
  leadingControls,
  onClose,
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
    <header className="border-b bg-background">
      <div className="flex h-12 items-center gap-4 px-5">
        {leadingControls}
        <div className="inline-flex h-[28px] items-center gap-2 rounded-md bg-muted px-2.5 text-sm text-foreground">
          <button
            aria-label="隐藏审查"
            className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
            type="button"
            onClick={onClose}
          >
            <X className="size-3.5" />
          </button>
          <span>审查</span>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-5 pb-2.5 pt-0">
        <div>
          <div className="flex min-h-7 flex-wrap items-center gap-3">
            <CompareModeMenu compareMode={compareMode} onCompareModeChange={onCompareModeChange} />
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
          <IconTooltip label={isFileTreeVisible ? "隐藏文件树" : "显示文件树"} onClick={onToggleFileTree}>
            <Folder className="size-4" />
          </IconTooltip>
        </div>
      </div>
    </header>
  );
}
