import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { buildFileTree } from "@/domain/fileTree";
import type {
  AppSettings,
  CompareMode,
  CompareModeFileCounts,
  DiffFile,
  ReviewSession,
  ReviewSummary,
} from "@/domain/types";
import { DiffViewer } from "./DiffViewer";
import { FileTree } from "./FileTree";
import { ReviewToolbar } from "./ReviewToolbar";
import {
  getEffectiveReadingMode,
  getIsAllCollapsed,
  getReviewLayoutClassName,
  getReviewLayoutStyle,
  getReviewPaneClassName,
  getVisibleFiles,
} from "./review-workspace/reviewWorkspaceUtils";
import { useFileSelection } from "./review-workspace/useFileSelection";
import { useResizableFileTree } from "./review-workspace/useResizableFileTree";
import { StateBlock } from "./StateBlock";

interface ReviewWorkspaceProps {
  collapsedFileIds: Set<string>;
  compareMode: CompareMode;
  compareModeFileCounts: CompareModeFileCounts;
  isLoading: boolean;
  localBranches: string[];
  reviewError: string | null;
  selectedFileId: string | null;
  session: ReviewSession;
  settings: AppSettings;
  summary: ReviewSummary | null;
  leadingControls?: ReactNode;
  onClose: () => void;
  onCompareModeChange: (mode: CompareMode) => void;
  onRefresh: () => void;
  onSelectedFileChange: (fileId: string) => void;
  onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
  onToggleAllCollapsed: () => void;
  onToggleFile: (fileId: string) => void;
}

export function ReviewWorkspace({
  collapsedFileIds,
  compareMode,
  compareModeFileCounts,
  isLoading,
  localBranches,
  reviewError,
  selectedFileId,
  session,
  settings,
  summary,
  leadingControls,
  onClose,
  onCompareModeChange,
  onRefresh,
  onSelectedFileChange,
  onSettingsChange,
  onToggleAllCollapsed,
  onToggleFile,
}: ReviewWorkspaceProps) {
  const [isFileTreeVisible, setIsFileTreeVisible] = useState(true);
  const { fileTreeWidth, isResizing, startResize } = useResizableFileTree(() => setIsFileTreeVisible(false));
  const fileTree = useMemo(() => buildFileTree(summary?.files ?? []), [summary]);
  const effectiveReadingMode = getEffectiveReadingMode(summary, settings);
  const visibleFiles = getVisibleFiles(summary, effectiveReadingMode, selectedFileId);
  const isAllCollapsed = getIsAllCollapsed(summary, collapsedFileIds);
  const { selectFile } = useFileSelection({
    readingMode: effectiveReadingMode,
    onSelectedFileChange,
  });

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[auto_1fr]">
      <ReviewToolbar
        compareMode={compareMode}
        compareModeFileCounts={compareModeFileCounts}
        isFileTreeVisible={isFileTreeVisible}
        isAllCollapsed={isAllCollapsed}
        localBranches={localBranches}
        session={session}
        settings={settings}
        summary={summary}
        leadingControls={leadingControls}
        onClose={onClose}
        onCompareModeChange={onCompareModeChange}
        onSettingsChange={onSettingsChange}
        onToggleAllCollapsed={onToggleAllCollapsed}
        onToggleFileTree={() => setIsFileTreeVisible((visible) => !visible)}
      />

      <motion.div
        animate={getReviewLayoutStyle(isFileTreeVisible, fileTreeWidth)}
        className={getReviewLayoutClassName()}
        transition={isResizing ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
      >
        <section className={getReviewPaneClassName(isFileTreeVisible)}>
          {summary?.isLargeDiff && (
            <div className="flex h-7 items-center bg-amber-50 px-5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              检测到大量差异：每次仅显示一个文件。
            </div>
          )}
          <ReviewContent
            compareMode={compareMode}
            collapsedFileIds={collapsedFileIds}
            files={visibleFiles}
            isLoading={isLoading}
            projectPath={session.projectPath}
            reviewError={reviewError}
            settings={settings}
            summary={summary}
            onCompareModeChange={onCompareModeChange}
            onRefresh={onRefresh}
            onSettingsChange={onSettingsChange}
            onToggleFile={onToggleFile}
          />
        </section>
        <AnimatePresence initial={false}>
          {isFileTreeVisible && (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="min-h-0 min-w-0 overflow-hidden"
              exit={{ opacity: 0, x: 28 }}
              initial={{ opacity: 0, x: 28 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <FileTree
                nodes={fileTree}
                projectPath={session.projectPath}
                selectedFileId={selectedFileId}
                onResizeStart={startResize}
                onSelectFile={selectFile}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}

function ReviewContent({
  collapsedFileIds,
  compareMode,
  files,
  isLoading,
  projectPath,
  reviewError,
  settings,
  summary,
  onCompareModeChange,
  onRefresh,
  onSettingsChange,
  onToggleFile,
}: {
  collapsedFileIds: Set<string>;
  compareMode: CompareMode;
  files: DiffFile[];
  isLoading: boolean;
  projectPath: string;
  reviewError: string | null;
  settings: AppSettings;
  summary: ReviewSummary | null;
  onCompareModeChange: (mode: CompareMode) => void;
  onRefresh: () => void;
  onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
  onToggleFile: (fileId: string) => void;
}) {
  if (isLoading) {
    return <StateBlock title="正在加载差异..." />;
  }

  if (reviewError) {
    return <StateBlock actionLabel="刷新" body={reviewError} title="Git 命令失败" onAction={onRefresh} />;
  }

  if (summary && summary.fileCount === 0) {
    const emptyState = getEmptyReviewState(compareMode);
    return (
      <StateBlock
        actionLabel={emptyState.actionLabel}
        body={emptyState.body}
        title={emptyState.title}
        onAction={emptyState.actionLabel ? () => onCompareModeChange("branch") : undefined}
      />
    );
  }

  return (
    <DiffViewer
      compareMode={compareMode}
      collapsedFileIds={collapsedFileIds}
      files={files}
      projectPath={projectPath}
      wrapDiffLines={settings.wrapDiffLines}
      viewMode={settings.diffViewMode}
      onToggleWrap={() => onSettingsChange((current) => ({ ...current, wrapDiffLines: !current.wrapDiffLines }))}
      onToggleFile={onToggleFile}
    />
  );
}

function getEmptyReviewState(compareMode: CompareMode) {
  if (compareMode === "staged") {
    return {
      actionLabel: "查看分支差异",
      body: "接受边界内容并暂存",
      title: "无暂存更改",
    };
  }

  if (compareMode === "unstaged") {
    return {
      actionLabel: "查看分支差异",
      body: "代码更改将在此处显示",
      title: "无未暂存更改",
    };
  }

  return {
    title: "当前对比方式暂无改动。",
  };
}
