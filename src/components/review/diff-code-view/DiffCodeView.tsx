import { useTranslation } from "react-i18next";
import type { AppSettings, CompareMode, DiffFile, ResolvedTheme, ReviewFileAction } from "@/domain/types";
import type { CodeViewItem, CodeViewOptions, DiffLineAnnotation, LineAnnotation } from "@pierre/diffs";
import {
  CodeView,
  type CodeViewHandle,
  useWorkerPool,
  WorkerPoolContextProvider,
} from "@pierre/diffs/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { readDiffViewScrollTop, writeDiffViewScrollTop } from "@/hooks/diffViewSessionCache";
import { DiffFileHeader } from "../diff-viewer/DiffFileHeader";
import { LocalCommentBox, type LocalCommentMetadata } from "../diff-viewer/LineComment";
import { DiffCodeViewContextMenu, getDiffCodeViewFileIdAttribute } from "./DiffCodeViewContextMenu";
import { getDiffCodeViewOptions } from "./diffCodeViewOptions";
import { createDiffFileMap, toCodeViewItems, type DiffCodeViewItem } from "./diffCodeViewItems";
import {
  diffWorkerHighlighterOptions,
  diffWorkerPoolOptions,
  getLineDiffType,
} from "./diffWorkerPool";
import { useDiffCodeViewComments } from "./useDiffCodeViewComments";

interface DiffCodeViewProps {
  /** CodeView ref，供文件树定位到连续模式中的目标文件。 */
  codeViewRef: RefObject<CodeViewHandle<LocalCommentMetadata> | null>;
  /** 已折叠的文件 id 集合，用于控制每个 CodeView item 的 collapsed 状态。 */
  collapsedFileIds: Set<string>;
  /** 当前对比方式，传给文件头决定是否展示暂存/取消暂存按钮。 */
  compareMode: CompareMode;
  /** 当前阅读模式下需要渲染的 diff 文件列表。 */
  files: DiffFile[];
  /** 当前项目根路径，用于文件块右键菜单。 */
  projectPath: string;
  /** 应用主题解析后的实际浅深色模式，用于驱动 Pierre themeType。 */
  resolvedTheme: ResolvedTheme;
  /** 用于跨刷新/HMR 恢复滚动位置的缓存键。 */
  scrollCacheKey: string | null;
  /** 本地展示设置，包含 diff 布局、字号、主题和标记方式。 */
  settings: AppSettings;
  /** 执行文件头上的还原/暂存/取消暂存操作。 */
  onFileAction: (filePath: string, action: ReviewFileAction) => void;
  /** 在文件块右键菜单中切换自动换行。 */
  onToggleWrap: () => void;
  /** 点击文件头时切换该文件折叠状态。 */
  onToggleFile: (fileId: string) => void;
}

type DiffCodeViewOptions = CodeViewOptions<LocalCommentMetadata>;
type DiffCodeViewAnnotation = LineAnnotation<LocalCommentMetadata> | DiffLineAnnotation<LocalCommentMetadata>;

export function DiffCodeView({
  codeViewRef,
  collapsedFileIds,
  compareMode,
  files,
  projectPath,
  resolvedTheme,
  scrollCacheKey,
  settings,
  onFileAction,
  onToggleWrap,
  onToggleFile,
}: DiffCodeViewProps) {
  const { t: translate } = useTranslation(["common", "review"]);
  // 父级短暂传入空列表时，继续渲染上一份文件，避免 CodeView.setItems([]) 白屏 reset。
  // 切换会话 / 对比方式（scrollCacheKey 变化）时必须丢弃，防止闪出上一会话内容。
  const stableFilesRef = useRef(files);
  const stableFilesCacheKeyRef = useRef(scrollCacheKey);
  if (stableFilesCacheKeyRef.current !== scrollCacheKey) {
    stableFilesCacheKeyRef.current = scrollCacheKey;
    stableFilesRef.current = files.length > 0 ? files : [];
  } else if (files.length > 0) {
    stableFilesRef.current = files;
  }
  const renderFiles = files.length > 0 ? files : stableFilesRef.current;

  const filesById = useMemo(() => createDiffFileMap(renderFiles), [renderFiles]);
  const {
    annotationsByFile,
    hasEditingComment,
    selectedLines,
    closeLineComment,
    openLineComment,
    saveCommentBody,
    selectCommentTarget,
    updateLineCommentMode,
  } = useDiffCodeViewComments();
  const previousCodeViewItemsRef = useRef<DiffCodeViewItem[]>([]);
  const lastScrollTopRef = useRef(scrollCacheKey ? readDiffViewScrollTop(scrollCacheKey) : 0);
  const codeViewItems = useMemo(() => {
    const nextItems = toCodeViewItems(
      renderFiles,
      collapsedFileIds,
      annotationsByFile,
      previousCodeViewItemsRef.current,
    );

    // 全部 item 引用未变时返回旧数组，触发 CodeView 的 areItemListsEqual 快路径。
    if (
      nextItems.length === previousCodeViewItemsRef.current.length &&
      nextItems.every((item, index) => item === previousCodeViewItemsRef.current[index])
    ) {
      return previousCodeViewItemsRef.current;
    }

    previousCodeViewItemsRef.current = nextItems;
    return nextItems;
  }, [annotationsByFile, collapsedFileIds, renderFiles]);

  const restoreScrollTop = useCallback(() => {
    const savedScrollTop = scrollCacheKey
      ? readDiffViewScrollTop(scrollCacheKey)
      : lastScrollTopRef.current;
    if (savedScrollTop <= 0) {
      return;
    }

    const instance = codeViewRef.current?.getInstance();
    if (!instance) {
      return;
    }

    const currentScrollTop = instance.getScrollTop();
    if (Math.abs(currentScrollTop - savedScrollTop) < 2) {
      return;
    }

    codeViewRef.current?.scrollTo({
      type: "position",
      position: savedScrollTop,
      behavior: "instant",
    });
  }, [codeViewRef, scrollCacheKey]);

  // items 更新后恢复滚动；双 rAF 等到 CodeView 布局完成。
  useLayoutEffect(() => {
    restoreScrollTop();
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        restoreScrollTop();
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [codeViewItems, restoreScrollTop]);

  // 挂载时从模块缓存恢复滚动（应对 HMR 重挂载）。
  useEffect(() => {
    restoreScrollTop();
  }, [restoreScrollTop, scrollCacheKey]);

  const handleScroll = useCallback(
    (scrollTop: number) => {
      lastScrollTopRef.current = scrollTop;
      if (scrollCacheKey) {
        writeDiffViewScrollTop(scrollCacheKey, scrollTop);
      }
    },
    [scrollCacheKey],
  );
  const handleGutterUtilityClick = useCallback<NonNullable<DiffCodeViewOptions["onGutterUtilityClick"]>>(
    (range, context) => {
      if (context.type !== "diff") {
        return;
      }

      openLineComment({
        fileId: context.item.id,
        lineNumber: range.end,
        side: range.endSide ?? range.side ?? "additions",
      });
    },
    [openLineComment],
  );
  const handleLineNumberClick = useCallback<NonNullable<DiffCodeViewOptions["onLineNumberClick"]>>(
    (line, context) => {
      if (context.type !== "diff") {
        return;
      }

      selectCommentTarget({
        fileId: context.item.id,
        lineNumber: line.lineNumber,
        side: "annotationSide" in line ? line.annotationSide : "additions",
      });
    },
    [selectCommentTarget],
  );
  const options = useMemo(
    () =>
      getDiffCodeViewOptions({
        hasEditingComment,
        hasSelectedCommentTarget: selectedLines != null,
        resolvedTheme,
        settings,
        onGutterUtilityClick: handleGutterUtilityClick,
        onLineNumberClick: handleLineNumberClick,
      }),
    [
      handleGutterUtilityClick,
      handleLineNumberClick,
      hasEditingComment,
      resolvedTheme,
      selectedLines,
      settings.diffCodeFontSize,
      settings.diffDarkTheme,
      settings.diffIndicatorMode,
      settings.diffLightTheme,
      settings.diffUiFontSize,
      settings.diffViewMode,
      settings.enableTextDiff,
      settings.wrapDiffLines,
    ],
  );
  const renderCustomHeader = useCallback(
    (item: CodeViewItem<LocalCommentMetadata>) => {
      const file = filesById.get(item.id);

      if (!file) {
        return null;
      }

      const collapsed = item.collapsed === true;

      return (
        <div className="group/file" {...getDiffCodeViewFileIdAttribute(file.id)}>
          <DiffFileHeader
            collapsed={collapsed}
            compareMode={compareMode}
            file={file}
            onFileAction={onFileAction}
            onToggle={() => onToggleFile(file.id)}
          />
          {!collapsed && file.isBinary && <div className="p-7 text-muted-foreground">{translate("review:diff.binaryNotice")}</div>}
        </div>
      );
    },
    [compareMode, filesById, onFileAction, onToggleFile],
  );
  const renderAnnotation = useCallback(
    (annotation: DiffCodeViewAnnotation) => {
      const { metadata } = annotation;

      return (
        <LocalCommentBox
          lineLabel={metadata.lineLabel}
          onCancel={() => closeLineComment(metadata.id)}
          onModeChange={(mode) => updateLineCommentMode(metadata.id, mode)}
          onSaveBody={(body) => saveCommentBody(metadata.id, body)}
        />
      );
    },
    [closeLineComment, saveCommentBody, updateLineCommentMode],
  );

  return (
    <DiffCodeViewContextMenu
      codeViewRef={codeViewRef}
      files={renderFiles}
      projectPath={projectPath}
      wrapDiffLines={settings.wrapDiffLines}
      onToggleWrap={onToggleWrap}
    >
      <WorkerPoolContextProvider highlighterOptions={diffWorkerHighlighterOptions} poolOptions={diffWorkerPoolOptions}>
        {/* Worker 池不会读取 CodeView options.lineDiffType，需要单独同步。 */}
        <DiffWorkerLineDiffSync enableTextDiff={settings.enableTextDiff} />
        <CodeView<LocalCommentMetadata>
          className="h-full min-h-0 overflow-auto overscroll-none bg-background"
          items={codeViewItems}
          options={options}
          ref={codeViewRef}
          renderAnnotation={renderAnnotation}
          renderCustomHeader={renderCustomHeader}
          selectedLines={selectedLines}
          onScroll={handleScroll}
        />
      </WorkerPoolContextProvider>
    </DiffCodeViewContextMenu>
  );
}

interface DiffWorkerLineDiffSyncProps {
  /** 是否启用行内文字差异，对应 worker renderOptions.lineDiffType。 */
  enableTextDiff: boolean;
}

/**
 * Pierre 在启用 WorkerPool 时，行内 diff 算法取自 worker 的 renderOptions，
 * 而不是 CodeView 的 options.lineDiffType。切换文字差异后必须主动 setRenderOptions，
 * 才会清 AST 缓存并触发重新高亮。
 */
function DiffWorkerLineDiffSync({ enableTextDiff }: DiffWorkerLineDiffSyncProps) {
  const workerPool = useWorkerPool();

  useEffect(() => {
    if (workerPool == null) {
      return;
    }

    void workerPool
      .setRenderOptions({
        lineDiffType: getLineDiffType(enableTextDiff),
      })
      .catch(() => undefined);
  }, [enableTextDiff, workerPool]);

  return null;
}
