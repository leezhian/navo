import { IconTooltip } from "@/components/ui/icon-tooltip";
import type { AppSettings, CompareMode, CompareModeFileCounts, ReviewSession, ReviewSummary } from "@/domain/types";
import {
  Check,
  ClipboardCopy,
  FolderClosed,
  FolderOpen,
  ListCollapse,
  ListTree,
  Rows3,
  SplitSquareHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useReviewComments } from "./diff-viewer/reviewCommentsContext";
import { BranchMenu } from "./review-toolbar/BranchMenu";
import { CompareModeMenu } from "./review-toolbar/CompareModeMenu";
import { toggleDiffView } from "./review-toolbar/settingsActions";
import { ViewOptionsMenu } from "./review-toolbar/ViewOptionsMenu";

const CHANGE_COUNT_FORMATTER = new Intl.NumberFormat("en-US");
const COPY_FEEDBACK_MS = 1600;

interface ReviewToolbarProps {
  /** 当前对比方式，驱动对比方式选择器和分支选择区域是否展示。 */
  compareMode: CompareMode;
  /** 未暂存/已暂存文件数角标数据。 */
  compareModeFileCounts: CompareModeFileCounts;
  /** 当前所有文件是否都处于折叠状态，用于折叠按钮文案与图标互切。 */
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
  /** 重新加载当前对比方式的 diff。 */
  onRefresh: () => void;
  /** 更新本地展示设置，例如目标分支或差异视图。 */
  onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
  /** 在全部折叠和全部展开之间切换。 */
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
  onRefresh,
  onSettingsChange,
  onToggleAllCollapsed,
  onToggleFileTree,
}: ReviewToolbarProps) {
  const { commentBodies, getExportableComments, copyExportTemplate } = useReviewComments();
  const [branchSearch, setBranchSearch] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "empty">("idle");
  const branchOptions = localBranches.filter((branch) =>
    branch.toLowerCase().includes(branchSearch.trim().toLowerCase()),
  );
  const additions = summary?.additions ?? session.additions;
  const deletions = summary?.deletions ?? session.deletions;
  const hasExportableComments = useMemo(
    () => getExportableComments(summary?.files ?? []).length > 0,
    [getExportableComments, summary?.files, commentBodies],
  );

  useEffect(() => {
    if (copyState === "idle") {
      return undefined;
    }

    const timer = window.setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function handleCopyComments() {
    const copied = await copyExportTemplate(summary?.files ?? []).catch(() => false);
    setCopyState(copied ? "copied" : "empty");
  }

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
            {additions > 0 && (
              <span className="text-green-600 dark:text-green-400">+{formatChangeCount(additions)}</span>
            )}
            {deletions > 0 && (
              <span className="text-red-600 dark:text-red-400">-{formatChangeCount(deletions)}</span>
            )}
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
            settings={settings}
            onRefresh={onRefresh}
            onSettingsChange={onSettingsChange}
          />
          <IconTooltip
            label={getCopyCommentsLabel(copyState, hasExportableComments)}
            onClick={() => {
              void handleCopyComments();
            }}
          >
            {copyState === "copied" ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
          </IconTooltip>
          <IconTooltip
            label={isAllCollapsed ? "展开全部差异" : "折叠全部差异"}
            onClick={onToggleAllCollapsed}
          >
            {isAllCollapsed ? <ListTree className="size-4" /> : <ListCollapse className="size-4" />}
          </IconTooltip>
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

function getCopyCommentsLabel(copyState: "idle" | "copied" | "empty", hasExportableComments: boolean) {
  if (copyState === "copied") {
    return "已复制审查评论";
  }

  if (copyState === "empty" || !hasExportableComments) {
    return "暂无已保存的评论";
  }

  return "复制审查评论";
}

function formatChangeCount(count: number) {
  return CHANGE_COUNT_FORMATTER.format(count);
}
