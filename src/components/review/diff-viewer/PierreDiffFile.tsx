import type { AppSettings, CompareMode, DiffFile } from "@/domain/types";
import type { DiffLineAnnotation } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { DiffFileHeader } from "./DiffFileHeader";
import {
  getLineCommentId,
  LocalCommentBox,
  LocalCommentButton,
  type LocalCommentMetadata,
} from "./LineComment";
import { pierreDiffUnsafeCss } from "./pierreDiffStyles";

type LocalCommentAnnotation = DiffLineAnnotation<LocalCommentMetadata>;

interface PierreDiffFileProps {
  collapsed: boolean;
  compareMode: CompareMode;
  file: DiffFile;
  lineAnnotations: LocalCommentAnnotation[];
  viewMode: AppSettings["diffViewMode"];
  wrapDiffLines: boolean;
  onCommentClose: (commentId: string) => void;
  onCommentOpen: (commentId: string) => void;
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
  return (
    <div className="overscroll-x-none">
      <FileDiff<LocalCommentMetadata>
        className="block min-w-full"
        disableWorkerPool
        fileDiff={file.pierreFile}
        lineAnnotations={lineAnnotations}
        options={{
          collapsed,
          diffIndicators: "bars",
          diffStyle: viewMode === "split" ? "split" : "unified",
          enableGutterUtility: true,
          hunkSeparators: "line-info",
          lineDiffType: "word",
          lineHoverHighlight: "both",
          overflow: wrapDiffLines ? "wrap" : "scroll",
          theme: {
            dark: "github-dark",
            light: "github-light",
          },
          themeType: "system",
          stickyHeader: true,
          tokenizeMaxLineLength: 3000,
          unsafeCSS: pierreDiffUnsafeCss,
        }}
        renderCustomHeader={() => (
          <DiffFileHeader collapsed={collapsed} compareMode={compareMode} file={file} onToggle={onToggle} />
        )}
        renderAnnotation={(annotation) => (
          <LocalCommentBox
            lineLabel={annotation.metadata.lineLabel}
            onCancel={() => onCommentClose(annotation.metadata.id)}
          />
        )}
        renderGutterUtility={(getHoveredLine) => (
          <LocalCommentButton
            onClick={() => {
              const hoveredLine = getHoveredLine();

              if (!hoveredLine) {
                return;
              }

              onCommentOpen(getLineCommentId(file.id, hoveredLine.side, hoveredLine.lineNumber));
            }}
          />
        )}
      />
      {!collapsed && file.isBinary && <div className="p-7 text-muted-foreground">二进制文件不展示代码 diff。</div>}
    </div>
  );
}

export type { LocalCommentAnnotation };
