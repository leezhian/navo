import type { AppSettings, CompareMode, DiffFile } from "@/domain/types";
import type {
  DiffLineAnnotation,
  FileDiff as PierreFileDiffInstance,
  FileDiffOptions,
  PostRenderPhase,
  SelectedLineRange,
} from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { DiffFileHeader } from "./DiffFileHeader";
import { getLineCommentId, LocalCommentBox, type LocalCommentMetadata } from "./LineComment";
import { pierreDiffUnsafeCss } from "./pierreDiffStyles";

type LocalCommentAnnotation = DiffLineAnnotation<LocalCommentMetadata>;

interface PierreDiffFileProps {
  /** 当前文件是否折叠，直接映射到 Pierre FileDiff 的 collapsed 配置。 */
  collapsed: boolean;
  /** 当前对比方式，传给自定义文件头判断文件级操作按钮。 */
  compareMode: CompareMode;
  /** 应用层文件数据，内部持有 Pierre 解析后的 fileDiff 元数据。 */
  file: DiffFile;
  /** 当前文件内需要插入的本地评论 annotation。 */
  lineAnnotations: LocalCommentAnnotation[];
  /** 统一或分栏视图，映射到 Pierre 的 diffStyle。 */
  viewMode: AppSettings["diffViewMode"];
  /** 自动换行开关，映射到 Pierre 的 overflow 配置。 */
  wrapDiffLines: boolean;
  /** 关闭指定本地评论 annotation。 */
  onCommentClose: (commentId: string) => void;
  /** 点击行号 gutter 加号时打开本地评论。 */
  onCommentOpen: (commentId: string) => void;
  /** 点击自定义文件头时切换文件折叠状态。 */
  onToggle: () => void;
}

export function PierreDiffFile({
  collapsed,
  compareMode,
  file,
  lineAnnotations,
  viewMode,
  wrapDiffLines,
  onCommentClose,
  onCommentOpen,
  onToggle,
}: PierreDiffFileProps) {
  const latestScrollTopRef = useRef(0);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  const recordLatestScrollTop = useCallback((event: Event) => {
    const scrollContainer = event.currentTarget;
    if (scrollContainer instanceof HTMLElement) {
      latestScrollTopRef.current = scrollContainer.scrollTop;
    }
  }, []);

  useEffect(() => {
    return () => {
      scrollContainerRef.current?.removeEventListener("scroll", recordLatestScrollTop);
    };
  }, [recordLatestScrollTop]);

  const handlePostRender = useCallback(
    (node: HTMLElement, _instance: PierreFileDiffInstance<LocalCommentMetadata>, phase: PostRenderPhase) => {
      const scrollContainer = getScrollContainer(node);
      if (scrollContainerRef.current !== scrollContainer) {
        scrollContainerRef.current?.removeEventListener("scroll", recordLatestScrollTop);
        scrollContainerRef.current = scrollContainer;
        latestScrollTopRef.current = scrollContainer?.scrollTop ?? 0;
        scrollContainer?.addEventListener("scroll", recordLatestScrollTop, { passive: true });
      }

      if (phase !== "update" || !scrollContainer) {
        return;
      }

      // Pierre 在部分更新后可能把外层滚动容器置顶；这里只在异常归零时恢复用户上次滚动位置。
      const previousScrollTop = latestScrollTopRef.current;
      if (previousScrollTop > 0 && scrollContainer.scrollTop === 0) {
        scrollContainer.scrollTop = previousScrollTop;
      }
    },
    [recordLatestScrollTop],
  );

  const handleGutterUtilityClick = useCallback(
    (range: SelectedLineRange) => {
      const lineNumber = range.end;
      const side = range.endSide ?? range.side ?? "additions";
      onCommentOpen(getLineCommentId(file.id, side, lineNumber));
    },
    [file.id, onCommentOpen],
  );

  const options = useMemo<FileDiffOptions<LocalCommentMetadata>>(
    () => ({
      collapsed,
      diffIndicators: "bars",
      diffStyle: viewMode === "split" ? "split" : "unified",
      enableGutterUtility: true,
      hunkSeparators: "line-info",
      lineDiffType: "word",
      lineHoverHighlight: "disabled",
      onGutterUtilityClick: handleGutterUtilityClick,
      onPostRender: handlePostRender,
      overflow: wrapDiffLines ? "wrap" : "scroll",
      theme: {
        dark: "pierre-dark",
        light: "pierre-light",
      },
      themeType: "system",
      stickyHeader: true,
      tokenizeMaxLineLength: 3000,
      unsafeCSS: pierreDiffUnsafeCss,
    }),
    [collapsed, handleGutterUtilityClick, handlePostRender, viewMode, wrapDiffLines],
  );

  const renderCustomHeader = useCallback(
    () => <DiffFileHeader collapsed={collapsed} compareMode={compareMode} file={file} onToggle={onToggle} />,
    [collapsed, compareMode, file, onToggle],
  );

  const renderAnnotation = useCallback(
    (annotation: LocalCommentAnnotation) => (
      <LocalCommentBox lineLabel={annotation.metadata.lineLabel} onCancel={() => onCommentClose(annotation.metadata.id)} />
    ),
    [onCommentClose],
  );

  return (
    <div className="overscroll-x-none">
      <FileDiff<LocalCommentMetadata>
        className="block min-w-full"
        disableWorkerPool
        fileDiff={file.pierreFile}
        lineAnnotations={lineAnnotations}
        options={options}
        renderAnnotation={renderAnnotation}
        renderCustomHeader={renderCustomHeader}
      />
      {!collapsed && file.isBinary && <div className="p-7 text-muted-foreground">二进制文件不展示代码 diff。</div>}
    </div>
  );
}

export type { LocalCommentAnnotation };

function getScrollContainer(node: HTMLElement) {
  let current: HTMLElement | null = node.parentElement;

  while (current) {
    const { overflowY } = window.getComputedStyle(current);
    if (overflowY === "auto" || overflowY === "scroll") {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}
