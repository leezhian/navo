import type { AppSettings, CompareMode, DiffFile, ResolvedTheme, ReviewFileAction } from "@/domain/types";
import type { CodeViewItem, CodeViewOptions, DiffLineAnnotation, LineAnnotation } from "@pierre/diffs";
import { CodeView, type CodeViewHandle, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { useCallback, useMemo, type RefObject } from "react";
import { DiffFileHeader } from "../diff-viewer/DiffFileHeader";
import { LocalCommentBox, type LocalCommentMetadata } from "../diff-viewer/LineComment";
import { DiffCodeViewContextMenu, getDiffCodeViewFileIdAttribute } from "./DiffCodeViewContextMenu";
import { getDiffCodeViewOptions } from "./diffCodeViewOptions";
import { createDiffFileMap, toCodeViewItems } from "./diffCodeViewItems";
import { diffWorkerHighlighterOptions, diffWorkerPoolOptions } from "./diffWorkerPool";
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
  settings,
  onFileAction,
  onToggleWrap,
  onToggleFile,
}: DiffCodeViewProps) {
  const filesById = useMemo(() => createDiffFileMap(files), [files]);
  const {
    annotationsByFile,
    hasEditingComment,
    selectedLines,
    closeLineComment,
    openLineComment,
    selectCommentTarget,
    updateLineCommentMode,
  } = useDiffCodeViewComments();
  const codeViewItems = useMemo(
    () => toCodeViewItems(files, collapsedFileIds, annotationsByFile),
    [annotationsByFile, collapsedFileIds, files],
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
          {!collapsed && file.isBinary && <div className="p-7 text-muted-foreground">二进制文件不展示代码 diff。</div>}
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
        />
      );
    },
    [closeLineComment, updateLineCommentMode],
  );

  return (
    <DiffCodeViewContextMenu
      codeViewRef={codeViewRef}
      files={files}
      projectPath={projectPath}
      wrapDiffLines={settings.wrapDiffLines}
      onToggleWrap={onToggleWrap}
    >
      <WorkerPoolContextProvider highlighterOptions={diffWorkerHighlighterOptions} poolOptions={diffWorkerPoolOptions}>
        <CodeView<LocalCommentMetadata>
          className="h-full min-h-0 overflow-auto overscroll-none bg-background"
          items={codeViewItems}
          options={options}
          ref={codeViewRef}
          renderAnnotation={renderAnnotation}
          renderCustomHeader={renderCustomHeader}
          selectedLines={selectedLines}
        />
      </WorkerPoolContextProvider>
    </DiffCodeViewContextMenu>
  );
}
