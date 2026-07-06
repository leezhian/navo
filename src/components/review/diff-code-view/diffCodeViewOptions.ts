import type { AppSettings, ResolvedTheme } from "@/domain/types";
import type { CodeViewOptions } from "@pierre/diffs";
import type { LocalCommentMetadata } from "../diff-viewer/LineComment";
import { getDiffCodeLineHeight, getPierreDiffIndicators, getPierreTheme, getPierreUnsafeCss } from "../diff-viewer/pierreDiffOptions";

type DiffCodeViewOptions = CodeViewOptions<LocalCommentMetadata>;

interface DiffCodeViewOptionsInput {
  /** 是否存在草稿或编辑中的评论，用来切换 hover 加号和点击选行模式。 */
  hasEditingComment: boolean;
  /** 是否有当前蓝色选中的评论目标。 */
  hasSelectedCommentTarget: boolean;
  /** 应用主题解析后的实际浅深色模式。 */
  resolvedTheme: ResolvedTheme;
  /** 本地 diff 展示设置。 */
  settings: AppSettings;
  /** 点击 gutter 加号或拖选区域时打开评论。 */
  onGutterUtilityClick: NonNullable<DiffCodeViewOptions["onGutterUtilityClick"]>;
  /** 编辑评论时点击行号更新评论目标。 */
  onLineNumberClick: NonNullable<DiffCodeViewOptions["onLineNumberClick"]>;
}

const DIFF_HEADER_HEIGHT = 36;
const DIFF_HUNK_LINE_COUNT = 80;
const DIFF_BOTTOM_PADDING = 80;

export function getDiffCodeViewOptions({
  hasEditingComment,
  hasSelectedCommentTarget,
  resolvedTheme,
  settings,
  onGutterUtilityClick,
  onLineNumberClick,
}: DiffCodeViewOptionsInput): DiffCodeViewOptions {
  const lineHeight = getDiffCodeLineHeight(settings.diffCodeFontSize);

  return {
    controlledSelection: true,
    diffIndicators: getPierreDiffIndicators(settings.diffIndicatorMode),
    diffStyle: settings.diffViewMode === "split" ? "split" : "unified",
    enableGutterUtility: !hasEditingComment || hasSelectedCommentTarget,
    hunkSeparators: "line-info",
    itemMetrics: {
      diffHeaderHeight: DIFF_HEADER_HEIGHT,
      hunkLineCount: DIFF_HUNK_LINE_COUNT,
      lineHeight,
      spacing: 0,
    },
    layout: {
      gap: 0,
      paddingBottom: DIFF_BOTTOM_PADDING,
      paddingTop: 0,
    },
    lineDiffType: "word",
    lineHoverHighlight: "disabled",
    onGutterUtilityClick,
    onLineNumberClick: hasEditingComment ? onLineNumberClick : undefined,
    overflow: settings.wrapDiffLines ? "wrap" : "scroll",
    stickyHeaders: true,
    theme: getPierreTheme(settings),
    themeType: resolvedTheme,
    tokenizeMaxLineLength: 3000,
    unsafeCSS: getPierreUnsafeCss(settings),
  };
}
