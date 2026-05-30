import { IconTooltip } from "@/components/ui/icon-tooltip";
import { ChevronDown, Minus, Plus, Undo2 } from "lucide-react";
import { useState } from "react";
import type { KeyboardEvent } from "react";
import type { AppSettings, CompareMode, DiffFile, DiffLine } from "../../domain/types";
import { getSplitCellClassName, getUnifiedLineClassName, pairSplitLines } from "./diff-viewer/diffViewUtils";
import {
  getCommentLineLabel,
  getLineCommentId,
  LineNumberCell,
  LocalCommentBox,
} from "./diff-viewer/LineComment";
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
          collapsed={collapsedFileIds.has(file.id)}
          file={file}
          key={file.id}
          activeCommentIds={activeCommentIds}
          compareMode={compareMode}
          viewMode={viewMode}
          projectPath={projectPath}
          wrapDiffLines={wrapDiffLines}
          onCommentClose={closeLineComment}
          onCommentOpen={openLineComment}
          onToggleWrap={onToggleWrap}
          onToggle={() => onToggleFile(file.id)}
        />
      ))}
    </>
  );
}

function DiffFileView({
  collapsed,
  compareMode,
  file,
  activeCommentIds,
  viewMode,
  projectPath,
  wrapDiffLines,
  onCommentClose,
  onCommentOpen,
  onToggleWrap,
  onToggle,
}: {
  collapsed: boolean;
  compareMode: CompareMode;
  file: DiffFile;
  activeCommentIds: Set<string>;
  viewMode: AppSettings["diffViewMode"];
  projectPath: string;
  wrapDiffLines: boolean;
  onCommentClose: (commentId: string) => void;
  onCommentOpen: (commentId: string) => void;
  onToggleWrap: () => void;
  onToggle: () => void;
}) {
  const handleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    onToggle();
  };

  return (
    <FileContextMenu
      file={file}
      projectPath={projectPath}
      showWrapToggle
      wrapDiffLines={wrapDiffLines}
      onToggleWrap={onToggleWrap}
    >
      <article className="group/file" id={`diff-file-${file.id}`}>
        <div
          className="sticky top-0 z-20 flex min-h-9 w-full cursor-default items-center justify-between gap-4 bg-background px-5.5 text-left hover:bg-muted"
          role="button"
          tabIndex={0}
          onKeyDown={handleHeaderKeyDown}
          onClick={onToggle}
        >
          <div className="flex min-w-0 items-center gap-2">
            <ChevronDown
              className={
                collapsed
                  ? "size-4 shrink-0 transition-transform duration-150"
                  : "-rotate-180 size-4 shrink-0 transition-transform duration-150"
              }
            />
            <span className="truncate text-sm">{file.displayPath}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <FileHeaderActions compareMode={compareMode} />
            <span className="text-green-600 dark:text-green-400">+{file.additions}</span>
            <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
          </div>
        </div>
        {renderFileBody({
          activeCommentIds,
          collapsed,
          file,
          viewMode,
          onCommentClose,
          onCommentOpen,
        })}
      </article>
    </FileContextMenu>
  );
}

function FileHeaderActions({ compareMode }: { compareMode: CompareMode }) {
  if (compareMode !== "staged" && compareMode !== "unstaged") {
    return null;
  }

  const secondaryActionLabel = compareMode === "staged" ? "取消暂存文件" : "暂存文件";
  const SecondaryIcon = compareMode === "staged" ? Minus : Plus;

  return (
    <span
      className="mr-1 flex items-center gap-1.5 opacity-0 transition-opacity group-hover/file:opacity-100"
      onClick={(event) => event.stopPropagation()}
    >
      <IconTooltip className="size-7" label="还原文件">
        <Undo2 className="size-4" />
      </IconTooltip>
      <IconTooltip className="size-7" label={secondaryActionLabel}>
        <SecondaryIcon className="size-4" />
      </IconTooltip>
    </span>
  );
}

function renderFileBody({
  activeCommentIds,
  collapsed,
  file,
  viewMode,
  onCommentClose,
  onCommentOpen,
}: {
  activeCommentIds: Set<string>;
  collapsed: boolean;
  file: DiffFile;
  viewMode: AppSettings["diffViewMode"];
  onCommentClose: (commentId: string) => void;
  onCommentOpen: (commentId: string) => void;
}) {
  if (collapsed) {
    return null;
  }

  if (file.isBinary) {
    return <div className="p-7 text-muted-foreground">二进制文件不展示代码 diff。</div>;
  }

  return (
    <div className="overflow-x-auto overscroll-x-none">
      {viewMode === "split" ? (
        <SplitDiff
          activeCommentIds={activeCommentIds}
          file={file}
          onCommentClose={onCommentClose}
          onCommentOpen={onCommentOpen}
        />
      ) : (
        <UnifiedDiff
          activeCommentIds={activeCommentIds}
          file={file}
          onCommentClose={onCommentClose}
          onCommentOpen={onCommentOpen}
        />
      )}
    </div>
  );
}

function UnifiedDiff({
  activeCommentIds,
  file,
  onCommentClose,
  onCommentOpen,
}: {
  activeCommentIds: Set<string>;
  file: DiffFile;
  onCommentClose: (commentId: string) => void;
  onCommentOpen: (commentId: string) => void;
}) {
  return (
    <div className="inline-block min-w-full">
      {file.hunks.map((hunk) => (
        <div className="font-mono text-xs leading-[22px]" key={hunk.id}>
          <FoldRow count={hunk.leadingContext} />
          {hunk.lines.map((line) => (
            <UnifiedLine
              activeCommentIds={activeCommentIds}
              fileId={file.id}
              key={line.id}
              line={line}
              onCommentClose={onCommentClose}
              onCommentOpen={onCommentOpen}
            />
          ))}
          <FoldRow count={hunk.trailingContext} />
        </div>
      ))}
    </div>
  );
}

function SplitDiff({
  activeCommentIds,
  file,
  onCommentClose,
  onCommentOpen,
}: {
  activeCommentIds: Set<string>;
  file: DiffFile;
  onCommentClose: (commentId: string) => void;
  onCommentOpen: (commentId: string) => void;
}) {
  return (
    <div className="inline-block min-w-full">
      {file.hunks.map((hunk) => (
        <div className="font-mono text-xs leading-[22px]" key={hunk.id}>
          <div className="grid grid-cols-2">
            <FoldRow count={hunk.leadingContext} />
            <FoldRow count={hunk.leadingContext} />
          </div>
          {pairSplitLines(hunk.lines).map((row) => (
            <div
              className="split-diff-row grid w-full min-w-max grid-cols-[minmax(max-content,1fr)_minmax(max-content,1fr)]"
              key={row.id}
            >
              <SplitCell
                activeCommentIds={activeCommentIds}
                fileId={file.id}
                line={row.oldLine}
                side="old"
                onCommentClose={onCommentClose}
                onCommentOpen={onCommentOpen}
              />
              <SplitCell
                activeCommentIds={activeCommentIds}
                fileId={file.id}
                line={row.newLine}
                side="new"
                onCommentClose={onCommentClose}
                onCommentOpen={onCommentOpen}
              />
            </div>
          ))}
          <div className="grid grid-cols-2">
            <FoldRow count={hunk.trailingContext} />
            <FoldRow count={hunk.trailingContext} />
          </div>
        </div>
      ))}
    </div>
  );
}

function UnifiedLine({
  activeCommentIds,
  fileId,
  line,
  onCommentClose,
  onCommentOpen,
}: {
  activeCommentIds: Set<string>;
  fileId: string;
  line: DiffLine;
  onCommentClose: (commentId: string) => void;
  onCommentOpen: (commentId: string) => void;
}) {
  const commentId = getLineCommentId(fileId, line, "unified");

  return (
    <>
      <div className={getUnifiedLineClassName(line.type)}>
        <LineNumberCell
          commentId={commentId}
          lineNumber={line.newLineNumber ?? line.oldLineNumber}
          onCommentOpen={onCommentOpen}
        />
        <code className="min-w-0 pl-4 font-mono whitespace-pre">{line.content}</code>
      </div>
      {activeCommentIds.has(commentId) && (
        <LocalCommentBox lineLabel={getCommentLineLabel(line, "unified")} onCancel={() => onCommentClose(commentId)} />
      )}
    </>
  );
}

function SplitCell({
  activeCommentIds,
  fileId,
  line,
  side,
  onCommentClose,
  onCommentOpen,
}: {
  activeCommentIds: Set<string>;
  fileId: string;
  line: DiffLine | null;
  side: "old" | "new";
  onCommentClose: (commentId: string) => void;
  onCommentOpen: (commentId: string) => void;
}) {
  const commentId = line ? getLineCommentId(fileId, line, side) : null;

  return (
    <div>
      <div className={getSplitCellClassName(line?.type, side)}>
        <LineNumberCell
          commentId={commentId}
          lineNumber={side === "old" ? line?.oldLineNumber ?? null : line?.newLineNumber ?? null}
          stickyClassName={side === "old" ? "left-0" : "left-1/2"}
          onCommentOpen={onCommentOpen}
        />
        <code className="min-w-0 pl-4 font-mono whitespace-pre">{line?.content ?? ""}</code>
      </div>
      {line && commentId && activeCommentIds.has(commentId) && (
        <LocalCommentBox lineLabel={getCommentLineLabel(line, side)} onCancel={() => onCommentClose(commentId)} />
      )}
    </div>
  );
}

function FoldRow({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }

  return (
    <div className="flex h-10 items-center gap-3 bg-muted px-4 font-sans text-xs text-muted-foreground">
      <ChevronDown className="size-4" />
      <span>{count} unmodified lines</span>
    </div>
  );
}
