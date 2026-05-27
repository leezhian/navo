import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  Folder,
  GitBranch,
  PanelLeft,
  Search,
  Settings2,
  SplitSquareHorizontal,
  Rows3,
} from "lucide-react";
import { useRef, useState } from "react";
import type { AppSettings, CompareMode, ReviewSession, ReviewSummary } from "../../domain/types";

const compareModeLabels: Record<CompareMode, string> = {
  unstaged: "未暂存",
  staged: "已暂存",
  branch: "分支",
  "previous-session": "上轮对话",
};

interface ReviewToolbarProps {
  compareMode: CompareMode;
  isFileTreeVisible: boolean;
  isAllCollapsed: boolean;
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
  isFileTreeVisible,
  isAllCollapsed,
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
        <IconTooltip label="显示/隐藏侧边栏" onClick={onClose}>
          <PanelLeft className="size-5" />
        </IconTooltip>
      </div>
    </header>
  );
}

function CompareModeMenu({
  compareMode,
  onCompareModeChange,
}: {
  compareMode: CompareMode;
  onCompareModeChange: (mode: CompareMode) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-8 gap-1 px-0 text-base font-normal hover:bg-transparent aria-expanded:bg-transparent aria-expanded:text-foreground focus-visible:border-transparent focus-visible:ring-0"
          type="button"
          variant="ghost"
        >
          <span>{compareModeLabels[compareMode]}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        {Object.entries(compareModeLabels).map(([value, label]) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => onCompareModeChange(value as CompareMode)}
          >
            <span>{label}</span>
            {compareMode === value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ViewOptionsMenu({
  isAllCollapsed,
  settings,
  onSettingsChange,
  onToggleAllCollapsed,
}: {
  isAllCollapsed: boolean;
  settings: AppSettings;
  onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
  onToggleAllCollapsed: () => void;
}) {
  const tooltip = useDropdownTooltip();

  return (
    <DropdownMenu onOpenChange={tooltip.handleMenuOpenChange}>
      <Tooltip open={tooltip.isTooltipOpen} onOpenChange={tooltip.handleTooltipOpenChange}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              className="text-muted-foreground hover:text-foreground"
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Settings2 className="size-[17px]" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">查看选项</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onSelect={() => updateWrap(onSettingsChange)}>
          {settings.wrapDiffLines ? "关闭差异换行" : "开启差异换行"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggleAllCollapsed}>
          {isAllCollapsed ? "全部展开" : "折叠全部"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BranchMenu({
  branchOptions,
  branchSearch,
  settings,
  onSearchChange,
  onSettingsChange,
}: {
  branchOptions: string[];
  branchSearch: string;
  settings: AppSettings;
  onSearchChange: (value: string) => void;
  onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
}) {
  const tooltip = useDropdownTooltip();

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        tooltip.handleMenuOpenChange(open);
        if (!open) {
          onSearchChange("");
        }
      }}
    >
      <Tooltip open={tooltip.isTooltipOpen} onOpenChange={tooltip.handleTooltipOpenChange}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              className="h-6 gap-1 px-0 text-[15px] font-normal text-muted-foreground hover:bg-transparent hover:text-foreground aria-expanded:bg-transparent aria-expanded:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0"
              type="button"
              variant="ghost"
            >
              <span>{settings.targetBranch}</span>
              <ChevronsUpDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{settings.targetBranch}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-[292px] p-2">
        <div className="flex h-8 items-center gap-2 px-2 text-muted-foreground">
          <Search className="size-3.5" />
          <Input
            className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            placeholder="搜索分支"
            value={branchSearch}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <DropdownMenuLabel>分支</DropdownMenuLabel>
        {branchOptions.map((branch) => (
          <BranchOption
            active={settings.targetBranch === branch}
            key={branch}
            label={branch}
            onSelect={() => updateTargetBranch(branch, onSettingsChange)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useDropdownTooltip() {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const suppressUntilRef = useRef(0);

  const suppressTooltip = () => {
    suppressUntilRef.current = Date.now() + 400;
    setIsTooltipOpen(false);
  };

  const handleMenuOpenChange = (open: boolean) => {
    setIsMenuOpen(open);
    suppressTooltip();
  };

  const handleTooltipOpenChange = (open: boolean) => {
    if (open && (isMenuOpen || Date.now() < suppressUntilRef.current)) {
      return;
    }

    setIsTooltipOpen(open);
  };

  return {
    handleMenuOpenChange,
    handleTooltipOpenChange,
    isTooltipOpen,
  };
}

function BranchOption({
  active,
  label,
  onSelect,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <GitBranch className="size-4 text-muted-foreground" />
      <span>{label}</span>
      {active && <Check className="ml-auto size-4" />}
    </DropdownMenuItem>
  );
}

function updateWrap(updateSettings: React.Dispatch<React.SetStateAction<AppSettings>>) {
  updateSettings((current) => ({ ...current, wrapDiffLines: !current.wrapDiffLines }));
}

function toggleDiffView(updateSettings: React.Dispatch<React.SetStateAction<AppSettings>>) {
  updateSettings((current) => ({
    ...current,
    diffViewMode: current.diffViewMode === "split" ? "unified" : "split",
  }));
}

function updateTargetBranch(
  targetBranch: string,
  updateSettings: React.Dispatch<React.SetStateAction<AppSettings>>,
) {
  updateSettings((current) => ({ ...current, targetBranch }));
}
