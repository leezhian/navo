import { t as translate } from "@/i18n";
import { useTranslation } from "react-i18next";
import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { buildFileTree } from "@/domain/fileTree";
import type {
  AppSettings,
  CompareMode,
  CompareModeFileCounts,
  DiffFile,
  ResolvedTheme,
  ReviewBatchFileAction,
  ReviewFileAction,
  ReviewSession,
  ReviewSummary,
} from "@/domain/types";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { DiffViewer } from "./DiffViewer";
import { FileTree } from "./FileTree";
import { ReviewToolbar } from "./ReviewToolbar";
import type { LocalCommentMetadata } from "./diff-viewer/LineComment";
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
import { ReviewCommentsProvider } from "./diff-viewer/reviewCommentsContext";
import { DiffBatchActionBar } from "./review-workspace/DiffBatchActionBar";
import { ReviewNoticeBar } from "./ReviewNoticeBar";
import { StateBlock } from "./StateBlock";

/** 未跟踪文件达到该数量才展示提示条，避免小数目打扰（对齐 Codex 风格）。 */
const UNTRACKED_NOTICE_THRESHOLD = 50;

interface ReviewWorkspaceProps {
  /** 已折叠的文件 id 集合，由 App 维护以支持跨模式保持折叠状态。 */
  collapsedFileIds: Set<string>;
  /** 当前对比方式，决定 diff 数据来源和空状态文案。 */
  compareMode: CompareMode;
  /** 各对比方式的文件数量角标，只展示未暂存和已暂存的非零数量。 */
  compareModeFileCounts: CompareModeFileCounts;
  /** 当前项目的本地分支列表，供分支对比选择器使用。 */
  localBranches: string[];
  /** Git 或解析失败信息，存在时优先展示错误状态。 */
  reviewError: string | null;
  /** 应用主题解析后的实际浅深色模式，用于驱动 Pierre themeType。 */
  resolvedTheme: ResolvedTheme;
  /** 单文件模式下正在查看的文件 id，连续模式下用于文件树定位。 */
  selectedFileId: string | null;
  /** 当前审查会话，提供项目路径、分支和兜底改动统计。 */
  session: ReviewSession;
  /** 本地展示设置，控制 diff 布局、换行、主题等行为。 */
  settings: AppSettings;
  /** 当前对比方式解析出的 diff 汇总数据。 */
  summary: ReviewSummary | null;
  /** 用于跨刷新/HMR 恢复滚动位置的缓存键。 */
  scrollCacheKey: string | null;
  /** 未跟踪文件数量；大于 0 时展示「仅跟踪改动」提示条。 */
  untrackedFileCount: number;
  /** 切换对比方式后由上层重新加载 diff。 */
  onCompareModeChange: (mode: CompareMode) => void;
  /** 点击 diff 悬浮条批量操作按钮时执行当前 diff 文件集合的 Git 操作。 */
  onBatchFileAction: (action: ReviewBatchFileAction) => void;
  /** 点击文件头还原/暂存/取消暂存按钮时执行对应 Git 文件操作。 */
  onFileAction: (filePath: string, action: ReviewFileAction) => void;
  /** 重新执行当前对比方式的 Git diff 加载。 */
  onRefresh: () => void;
  /** 文件树选择文件时更新选中项。 */
  onSelectedFileChange: (fileId: string) => void;
  /** 更新本地展示设置，例如换行、分栏和目标分支。 */
  onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
  /** 在全部折叠和全部展开之间切换。 */
  onToggleAllCollapsed: () => void;
  /** 切换单个文件 diff 的折叠状态。 */
  onToggleFile: (fileId: string) => void;
}

export function ReviewWorkspace({
  collapsedFileIds,
  compareMode,
  compareModeFileCounts,
  localBranches,
  reviewError,
  resolvedTheme,
  scrollCacheKey,
  selectedFileId,
  session,
  settings,
  summary,
  untrackedFileCount,
  onCompareModeChange,
  onBatchFileAction,
  onFileAction,
  onRefresh,
  onSelectedFileChange,
  onSettingsChange,
  onToggleAllCollapsed,
  onToggleFile,
}: ReviewWorkspaceProps) {
  const { t: translate } = useTranslation();
  const codeViewRef = useRef<CodeViewHandle<LocalCommentMetadata>>(null);
  const [isFileTreeVisible, setIsFileTreeVisible] = useState(true);
  const { fileTreeWidth, isResizing, startResize } = useResizableFileTree(() => setIsFileTreeVisible(false));
  const fileTree = useMemo(() => buildFileTree(summary?.files ?? []), [summary]);
  const effectiveReadingMode = getEffectiveReadingMode(summary, settings);
  const visibleFiles = useMemo(
    () => getVisibleFiles(summary, effectiveReadingMode, selectedFileId),
    [effectiveReadingMode, selectedFileId, summary],
  );
  const isAllCollapsed = getIsAllCollapsed(summary, collapsedFileIds);
  const scrollToFile = useCallback((fileId: string) => {
    codeViewRef.current?.scrollTo({ type: "item", id: fileId, align: "start", behavior: "smooth-auto" });
  }, []);
  const { selectFile } = useFileSelection({
    readingMode: effectiveReadingMode,
    onScrollToFile: scrollToFile,
    onSelectedFileChange,
  });

  return (
    <ReviewCommentsProvider>
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
          onCompareModeChange={onCompareModeChange}
          onRefresh={onRefresh}
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
            {summary?.isLargeDiff && <ReviewNoticeBar>{translate("检测到大量差异：每次仅显示一个文件。")}</ReviewNoticeBar>}
            {untrackedFileCount >= UNTRACKED_NOTICE_THRESHOLD && (
              <ReviewNoticeBar>
                {translate("仅展示已跟踪文件的改动：已跳过 {{count}} 个未跟踪文件。若为生成物请清理后刷新。", { count: untrackedFileCount })}
              </ReviewNoticeBar>
            )}
            <div className="relative min-h-0 flex-1">
              <ReviewContent
                codeViewRef={codeViewRef}
                compareMode={compareMode}
                collapsedFileIds={collapsedFileIds}
                files={visibleFiles}
                projectPath={session.projectPath}
                reviewError={reviewError}
                resolvedTheme={resolvedTheme}
                scrollCacheKey={scrollCacheKey}
                settings={settings}
                summary={summary}
                onBatchFileAction={onBatchFileAction}
                onCompareModeChange={onCompareModeChange}
                onFileAction={onFileAction}
                onRefresh={onRefresh}
                onSettingsChange={onSettingsChange}
                onToggleFile={onToggleFile}
              />
            </div>
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
    </ReviewCommentsProvider>
  );
}

function ReviewContent({
  codeViewRef,
  collapsedFileIds,
  compareMode,
  files,
  projectPath,
  reviewError,
  resolvedTheme,
  scrollCacheKey,
  settings,
  summary,
  onBatchFileAction,
  onCompareModeChange,
  onFileAction,
  onRefresh,
  onSettingsChange,
  onToggleFile,
}: ReviewContentProps) {
  const { t: translate } = useTranslation();
  const toggleWrapDiffLines = useCallback(() => {
    onSettingsChange((current) => ({ ...current, wrapDiffLines: !current.wrapDiffLines }));
  }, [onSettingsChange]);

  if (reviewError) {
    return <StateBlock actionLabel={translate("刷新")} body={reviewError} title={translate("Git 命令失败")} onAction={onRefresh} />;
  }

  if (summary && summary.fileCount === 0) {
    const emptyState = getEmptyReviewState(compareMode);
    return (
      <StateBlock
        actionClassName="font-normal"
        actionLabel={emptyState.actionLabel}
        actionVariant="secondary"
        body={emptyState.body}
        centered
        quietTitle
        title={emptyState.title}
        onAction={emptyState.actionLabel ? () => onCompareModeChange("branch") : undefined}
      />
    );
  }

  // summary 仍在加载且没有文件时，保持占位而不是挂载空 CodeView（空 items 会 reset 白屏）。
  if (!summary || files.length === 0) {
    return <div className="h-full min-h-0 bg-background" />;
  }

  return (
    <div className="relative h-full min-h-0">
      <DiffViewer
        codeViewRef={codeViewRef}
        compareMode={compareMode}
        collapsedFileIds={collapsedFileIds}
        files={files}
        projectPath={projectPath}
        resolvedTheme={resolvedTheme}
        scrollCacheKey={scrollCacheKey}
        settings={settings}
        onFileAction={onFileAction}
        onToggleWrap={toggleWrapDiffLines}
        onToggleFile={onToggleFile}
      />
      <DiffBatchActionBar compareMode={compareMode} hasFiles={files.length > 0} onBatchFileAction={onBatchFileAction} />
    </div>
  );
}

interface ReviewContentProps {
  /** CodeView ref，供连续模式文件树定位使用。 */
  codeViewRef: React.RefObject<CodeViewHandle<LocalCommentMetadata> | null>;
  /** 已折叠文件 id 集合，透传给 DiffViewer 控制每个文件块。 */
  collapsedFileIds: Set<string>;
  /** 当前对比方式，用于选择空状态文案和文件头操作。 */
  compareMode: CompareMode;
  /** 当前需要渲染的文件列表，已按连续/单文件模式过滤。 */
  files: DiffFile[];
  /** 当前项目根路径，供 diff 文件右键菜单使用。 */
  projectPath: string;
  /** 当前 Git diff 加载错误。 */
  reviewError: string | null;
  /** 应用主题解析后的实际浅深色模式，用于驱动 Pierre themeType。 */
  resolvedTheme: ResolvedTheme;
  /** 用于跨刷新恢复滚动位置的缓存键。 */
  scrollCacheKey: string | null;
  /** 本地展示设置，提供 diff 布局和换行状态。 */
  settings: AppSettings;
  /** 当前 diff 汇总，用于判断是否展示空状态。 */
  summary: ReviewSummary | null;
  /** 空状态按钮点击时切换到分支对比模式。 */
  onCompareModeChange: (mode: CompareMode) => void;
  /** 执行当前 diff 文件集合的批量 Git 操作。 */
  onBatchFileAction: (action: ReviewBatchFileAction) => void;
  /** 执行 diff 文件头上的文件级 Git 操作。 */
  onFileAction: (filePath: string, action: ReviewFileAction) => void;
  /** 错误状态中点击刷新时重新加载 diff。 */
  onRefresh: () => void;
  /** 从 diff 右键菜单中更新本地展示设置。 */
  onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
  /** 点击文件头时切换单个文件折叠状态。 */
  onToggleFile: (fileId: string) => void;
}

function getEmptyReviewState(compareMode: CompareMode) {
  if (compareMode === "staged") {
    return {
      actionLabel: translate("查看分支差异"),
      body: translate("接受编辑内容并暂存"),
      title: translate("无暂存更改"),
    };
  }

  if (compareMode === "unstaged") {
    return {
      actionLabel: translate("查看分支差异"),
      body: translate("代码更改将在此处显示"),
      title: translate("无未暂存更改"),
    };
  }

  return {
    title: translate("当前对比方式暂无改动。"),
  };
}
