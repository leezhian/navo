import { IconTooltip } from "@/components/ui/icon-tooltip";
import type { AppSettings, CompareMode, ReviewSession, ReviewSummary } from "@/domain/types";
import { Folder, PanelLeft, Rows3, SplitSquareHorizontal } from "lucide-react";
import { useState } from "react";
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
    <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b bg-background px-5 py-3">
      <div>
        <div className="flex h-7 items-center gap-3">
          <CompareModeMenu compareMode={compareMode} onCompareModeChange={onCompareModeChange} />
          <span className="text-green-600 dark:text-green-400">+{summary?.additions ?? session.additions}</span>
          <span className="text-red-600 dark:text-red-400">-{summary?.deletions ?? session.deletions}</span>
        </div>

        {compareMode === "branch" && (
          <div className="mt-3 flex items-center gap-3 text-[15px] leading-6 text-muted-foreground">
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

      <div className="flex self-start items-center gap-2">
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
            <Rows3 className="size-[17px]" />
          ) : (
            <SplitSquareHorizontal className="size-[17px]" />
          )}
        </IconTooltip>
        <IconTooltip label={isFileTreeVisible ? "隐藏文件树" : "显示文件树"} onClick={onToggleFileTree}>
          <Folder className="size-[17px]" />
        </IconTooltip>
        <IconTooltip label="显示/隐藏审查" onClick={onClose}>
          <PanelLeft className="size-5" />
        </IconTooltip>
      </div>
    </header>
  );
}
