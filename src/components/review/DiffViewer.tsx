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

interface DiffViewerProps {
  collapsedFileIds: Set<string>;
  compareMode: CompareMode;
  files: DiffFile[];
  viewMode: AppSettings["diffViewMode"];
  onToggleFile: (fileId: string) => void;
}

export function DiffViewer({ collapsedFileIds, compareMode, files, viewMode, onToggleFile }: DiffViewerProps) {
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  return (
    <>
      {files.map((file) => (
        <DiffFileView
          collapsed={collapsedFileIds.has(file.id)}
          file={file}
          key={file.id}
          activeCommentId={activeCommentId}
          compareMode={compareMode}
          viewMode={viewMode}
          onCommentOpen={setActiveCommentId}
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
  activeCommentId,
  viewMode,
  onCommentOpen,
  onToggle,
}: {
  collapsed: boolean;
  compareMode: CompareMode;
  file: DiffFile;
  activeCommentId: string | null;
  viewMode: AppSettings["diffViewMode"];
  onCommentOpen: (commentId: string | null) => void;
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
      {renderFileBody(file, collapsed, viewMode, activeCommentId, onCommentOpen)}
    </article>
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

function renderFileBody(
  file: DiffFile,
  collapsed: boolean,
  viewMode: AppSettings["diffViewMode"],
  activeCommentId: string | null,
  onCommentOpen: (commentId: string | null) => void,
) {
  if (collapsed) {
    return null;
  }

  if (file.isBinary) {
    return <div className="p-7 text-muted-foreground">二进制文件不展示代码 diff。</div>;
  }

  return (
    <div className="overflow-x-auto overscroll-x-none">
      {viewMode === "split" ? (
        <SplitDiff activeCommentId={activeCommentId} file={file} onCommentOpen={onCommentOpen} />
      ) : (
        <UnifiedDiff activeCommentId={activeCommentId} file={file} onCommentOpen={onCommentOpen} />
      )}
    </div>
  );
}

function UnifiedDiff({
  activeCommentId,
  file,
  onCommentOpen,
}: {
  activeCommentId: string | null;
  file: DiffFile;
  onCommentOpen: (commentId: string | null) => void;
}) {
  return (
    <div className="inline-block min-w-full">
      {file.hunks.map((hunk) => (
        <div className="font-mono text-xs leading-[22px]" key={hunk.id}>
          <FoldRow count={hunk.leadingContext} />
          {hunk.lines.map((line) => (
            <UnifiedLine
              activeCommentId={activeCommentId}
              fileId={file.id}
              key={line.id}
              line={line}
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
  activeCommentId,
  file,
  onCommentOpen,
}: {
  activeCommentId: string | null;
  file: DiffFile;
  onCommentOpen: (commentId: string | null) => void;
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
                activeCommentId={activeCommentId}
                fileId={file.id}
                line={row.oldLine}
                side="old"
                onCommentOpen={onCommentOpen}
              />
              <SplitCell
                activeCommentId={activeCommentId}
                fileId={file.id}
                line={row.newLine}
                side="new"
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
  activeCommentId,
  fileId,
  line,
  onCommentOpen,
}: {
  activeCommentId: string | null;
  fileId: string;
  line: DiffLine;
  onCommentOpen: (commentId: string | null) => void;
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
      {activeCommentId === commentId && (
        <LocalCommentBox lineLabel={getCommentLineLabel(line, "unified")} onCancel={() => onCommentOpen(null)} />
      )}
    </>
  );
}

function SplitCell({
  activeCommentId,
  fileId,
  line,
  side,
  onCommentOpen,
}: {
  activeCommentId: string | null;
  fileId: string;
  line: DiffLine | null;
  side: "old" | "new";
  onCommentOpen: (commentId: string | null) => void;
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
      {line && commentId && activeCommentId === commentId && (
        <LocalCommentBox lineLabel={getCommentLineLabel(line, side)} onCancel={() => onCommentOpen(null)} />
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
