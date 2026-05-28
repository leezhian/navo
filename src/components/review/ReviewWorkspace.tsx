import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { buildFileTree } from "@/domain/fileTree";
import type { AppSettings, CompareMode, DiffFile, ReviewSession, ReviewSummary } from "@/domain/types";
import { DiffViewer } from "./DiffViewer";
import { FileTree } from "./FileTree";
import { ReviewToolbar } from "./ReviewToolbar";
import {
  getEffectiveReadingMode,
  getIsAllCollapsed,
  getReviewLayoutClassName,
  getReviewPaneClassName,
  getVisibleFiles,
} from "./review-workspace/reviewWorkspaceUtils";
import { useFileSelection } from "./review-workspace/useFileSelection";
import { StateBlock } from "./StateBlock";

interface ReviewWorkspaceProps {
  collapsedFileIds: Set<string>;
  compareMode: CompareMode;
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

      <div className={getReviewLayoutClassName(isFileTreeVisible)}>
        <section className={getReviewPaneClassName(isFileTreeVisible, settings.wrapDiffLines)}>
          {summary?.isLargeDiff && (
            <div className="flex h-10 items-center border-b bg-amber-50 px-5 text-sm font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              检测到大量差异，已自动切换到单文件模式。可在查看选项中切回连续模式。
            </div>
          )}
          <ReviewContent
            collapsedFileIds={collapsedFileIds}
            files={visibleFiles}
            isLoading={isLoading}
            reviewError={reviewError}
            settings={settings}
            summary={summary}
            onRefresh={onRefresh}
            onToggleFile={onToggleFile}
          />
        </section>
        {isFileTreeVisible && (
          <FileTree
            nodes={fileTree}
            projectPath={session.projectPath}
            selectedFileId={selectedFileId}
            onSelectFile={selectFile}
          />
        )}
      </div>
    </section>
  );
}

function ReviewContent({
  collapsedFileIds,
  files,
  isLoading,
  reviewError,
  settings,
  summary,
  onRefresh,
  onToggleFile,
}: {
  collapsedFileIds: Set<string>;
  files: DiffFile[];
  isLoading: boolean;
  reviewError: string | null;
  settings: AppSettings;
  summary: ReviewSummary | null;
  onRefresh: () => void;
  onToggleFile: (fileId: string) => void;
}) {
  if (isLoading) {
    return <StateBlock title="正在加载差异..." />;
  }

  if (reviewError) {
    return <StateBlock actionLabel="刷新" body={reviewError} title="Git 命令失败" onAction={onRefresh} />;
  }

  if (summary && summary.fileCount === 0) {
    return <StateBlock title="当前对比方式暂无改动。" />;
  }

  return (
    <DiffViewer
      collapsedFileIds={collapsedFileIds}
      files={files}
      viewMode={settings.diffViewMode}
      onToggleFile={onToggleFile}
    />
  );
}
