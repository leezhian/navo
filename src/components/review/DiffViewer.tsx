import { useMemo, useState } from "react";
import type { AppSettings, CompareMode, DiffFile } from "../../domain/types";
import { parseLineCommentId } from "./diff-viewer/LineComment";
import { DiffFileHeader } from "./diff-viewer/DiffFileHeader";
import { PierreDiffFile, type LocalCommentAnnotation } from "./diff-viewer/PierreDiffFile";
import { FileContextMenu } from "./file-actions/FileContextMenu";

interface DiffViewerProps {
  collapsedFileIds: Set<string>;
  compareMode: CompareMode;
  files: DiffFile[];
  projectPath: string;
  wrapDiffLines: boolean;
  viewMode: AppSettings["diffViewMode"];
  onToggleWrap: () => void;
  onToggleFile: (fileId: string) => void;
}

export function DiffViewer({
  collapsedFileIds,
  compareMode,
  files,
  projectPath,
  wrapDiffLines,
  viewMode,
  onToggleWrap,
  onToggleFile,
}: DiffViewerProps) {
  const [activeCommentIds, setActiveCommentIds] = useState<Set<string>>(new Set());

  function openLineComment(commentId: string) {
    setActiveCommentIds((current) => new Set(current).add(commentId));
  }

  function closeLineComment(commentId: string) {
    setActiveCommentIds((current) => {
      const next = new Set(current);
      next.delete(commentId);
      return next;
    });
  }

  return (
    <>
      {files.map((file) => (
        <DiffFileView
          activeCommentIds={activeCommentIds}
          collapsed={collapsedFileIds.has(file.id)}
          compareMode={compareMode}
          file={file}
          key={file.id}
          projectPath={projectPath}
          viewMode={viewMode}
          wrapDiffLines={wrapDiffLines}
          onCommentClose={closeLineComment}
          onCommentOpen={openLineComment}
          onToggle={() => onToggleFile(file.id)}
          onToggleWrap={onToggleWrap}
        />
      ))}
    </>
  );
}

function DiffFileView({
  activeCommentIds,
  collapsed,
  compareMode,
  file,
  projectPath,
  viewMode,
  wrapDiffLines,
  onCommentClose,
  onCommentOpen,
  onToggle,
  onToggleWrap,
}: {
  activeCommentIds: Set<string>;
  collapsed: boolean;
  compareMode: CompareMode;
  file: DiffFile;
  projectPath: string;
  viewMode: AppSettings["diffViewMode"];
  wrapDiffLines: boolean;
  onCommentClose: (commentId: string) => void;
  onCommentOpen: (commentId: string) => void;
  onToggle: () => void;
  onToggleWrap: () => void;
}) {
  const lineAnnotations = useMemo(() => getLineAnnotations(file.id, activeCommentIds), [activeCommentIds, file.id]);

  return (
    <FileContextMenu
      file={file}
      projectPath={projectPath}
      showWrapToggle
      wrapDiffLines={wrapDiffLines}
      onToggleWrap={onToggleWrap}
    >
      <article className="group/file" id={`diff-file-${file.id}`}>
        <DiffFileHeader collapsed={collapsed} compareMode={compareMode} file={file} onToggle={onToggle} />
        {!collapsed && (
          <PierreDiffFile
            file={file}
            lineAnnotations={lineAnnotations}
            viewMode={viewMode}
            wrapDiffLines={wrapDiffLines}
            onCommentClose={onCommentClose}
            onCommentOpen={onCommentOpen}
          />
        )}
      </article>
    </FileContextMenu>
  );
}

function getLineAnnotations(fileId: string, activeCommentIds: Set<string>): LocalCommentAnnotation[] {
  const annotations: LocalCommentAnnotation[] = [];

  for (const commentId of activeCommentIds) {
    if (!commentId.startsWith(`${fileId}:`)) {
      continue;
    }

    const metadata = parseLineCommentId(commentId);

    if (!metadata) {
      continue;
    }

    annotations.push({
      lineNumber: metadata.lineNumber,
      metadata,
      side: metadata.side,
    });
  }

  return annotations;
}
