import type { AppSettings, DiffFile } from "@/domain/types";
import type { DiffLineAnnotation } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import {
  getLineCommentId,
  LocalCommentBox,
  LocalCommentButton,
  type LocalCommentMetadata,
} from "./LineComment";
import { pierreDiffUnsafeCss } from "./pierreDiffStyles";

type LocalCommentAnnotation = DiffLineAnnotation<LocalCommentMetadata>;

interface PierreDiffFileProps {
  file: DiffFile;
  lineAnnotations: LocalCommentAnnotation[];
  viewMode: AppSettings["diffViewMode"];
  wrapDiffLines: boolean;
  onCommentClose: (commentId: string) => void;
  onCommentOpen: (commentId: string) => void;
}

export function PierreDiffFile({
  file,
  lineAnnotations,
  viewMode,
  wrapDiffLines,
  onCommentClose,
  onCommentOpen,
}: PierreDiffFileProps) {
  if (file.isBinary) {
    return <div className="p-7 text-muted-foreground">二进制文件不展示代码 diff。</div>;
  }

  return (
    <div className="overscroll-x-none">
      <FileDiff<LocalCommentMetadata>
        className="block min-w-full"
        disableWorkerPool
        fileDiff={file.pierreFile}
        lineAnnotations={lineAnnotations}
        options={{
          diffIndicators: "bars",
          diffStyle: viewMode === "split" ? "split" : "unified",
          disableFileHeader: true,
          enableGutterUtility: true,
          hunkSeparators: "line-info-basic",
          lineDiffType: "word",
          lineHoverHighlight: "both",
          overflow: wrapDiffLines ? "wrap" : "scroll",
          theme: {
            dark: "github-dark",
            light: "github-light",
          },
          themeType: "system",
          tokenizeMaxLineLength: 3000,
          unsafeCSS: pierreDiffUnsafeCss,
        }}
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
    </div>
  );
}

export type { LocalCommentAnnotation };
