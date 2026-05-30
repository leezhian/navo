import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { AppSettings, DiffFile, DiffLine } from "../../domain/types";
import { getSplitCellClassName, getUnifiedLineClassName, pairSplitLines } from "./diff-viewer/diffViewUtils";
import {
  getCommentLineLabel,
  getLineCommentId,
  LineNumberCell,
  LocalCommentBox,
} from "./diff-viewer/LineComment";

interface DiffViewerProps {
  collapsedFileIds: Set<string>;
  files: DiffFile[];
  viewMode: AppSettings["diffViewMode"];
  onToggleFile: (fileId: string) => void;
}

export function DiffViewer({ collapsedFileIds, files, viewMode, onToggleFile }: DiffViewerProps) {
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  return (
    <>
      {files.map((file) => (
        <DiffFileView
          collapsed={collapsedFileIds.has(file.id)}
          file={file}
          key={file.id}
          activeCommentId={activeCommentId}
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
  file,
  activeCommentId,
  viewMode,
  onCommentOpen,
  onToggle,
}: {
  collapsed: boolean;
  file: DiffFile;
  activeCommentId: string | null;
  viewMode: AppSettings["diffViewMode"];
  onCommentOpen: (commentId: string | null) => void;
  onToggle: () => void;
}) {
  return (
    <article className="border-b" id={`diff-file-${file.id}`}>
      <header className="flex min-h-13 items-center justify-between gap-4 px-5.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-xs text-muted-foreground">
            {file.status}
          </span>
          <span className="truncate text-sm">{file.displayPath}</span>
        </div>
        <Button className="font-normal" type="button" variant="ghost" onClick={onToggle}>
          <span className="text-green-600 dark:text-green-400">+{file.additions}</span>
          <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
          {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </Button>
      </header>
      {renderFileBody(file, collapsed, viewMode, activeCommentId, onCommentOpen)}
    </article>
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
    return <div className="p-7 text-muted-foreground">文件已折叠</div>;
  }

  if (file.isBinary) {
    return <div className="p-7 text-muted-foreground">二进制文件不展示代码 diff。</div>;
  }

  return viewMode === "split" ? (
    <SplitDiff activeCommentId={activeCommentId} file={file} onCommentOpen={onCommentOpen} />
  ) : (
    <UnifiedDiff activeCommentId={activeCommentId} file={file} onCommentOpen={onCommentOpen} />
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
    <div>
      {file.hunks.map((hunk) => (
        <div className="font-mono text-xs leading-7" key={hunk.id}>
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
    <div>
      {file.hunks.map((hunk) => (
        <div className="font-mono text-xs leading-7" key={hunk.id}>
          <div className="grid grid-cols-2">
            <FoldRow count={hunk.leadingContext} />
            <FoldRow count={hunk.leadingContext} />
          </div>
          {pairSplitLines(hunk.lines).map((row) => (
            <div className="grid grid-cols-2" key={row.id}>
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
        <code className="min-w-0 overflow-hidden pl-4 font-mono whitespace-pre">{line.content}</code>
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
          onCommentOpen={onCommentOpen}
        />
        <code className="min-w-0 overflow-hidden pl-4 font-mono whitespace-pre">{line?.content ?? ""}</code>
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
