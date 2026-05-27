import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { AppSettings, DiffFile, DiffLine } from "../../domain/types";

interface DiffViewerProps {
  collapsedFileIds: Set<string>;
  files: DiffFile[];
  viewMode: AppSettings["diffViewMode"];
  onToggleFile: (fileId: string) => void;
}

export function DiffViewer({ collapsedFileIds, files, viewMode, onToggleFile }: DiffViewerProps) {
  return (
    <>
      {files.map((file) => (
        <DiffFileView
          collapsed={collapsedFileIds.has(file.id)}
          file={file}
          key={file.id}
          viewMode={viewMode}
          onToggle={() => onToggleFile(file.id)}
        />
      ))}
    </>
  );
}

function DiffFileView({
  collapsed,
  file,
  viewMode,
  onToggle,
}: {
  collapsed: boolean;
  file: DiffFile;
  viewMode: AppSettings["diffViewMode"];
  onToggle: () => void;
}) {
  return (
    <article className="border-b" id={`diff-file-${file.id}`}>
      <header className="flex min-h-13 items-center justify-between gap-4 px-5.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-xs text-muted-foreground">
            {file.status}
          </span>
          <strong className="truncate text-base">{file.displayPath}</strong>
        </div>
        <Button type="button" variant="ghost" onClick={onToggle}>
          <span className="text-green-600 dark:text-green-400">+{file.additions}</span>
          <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
          {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </Button>
      </header>
      {renderFileBody(file, collapsed, viewMode)}
    </article>
  );
}

function renderFileBody(file: DiffFile, collapsed: boolean, viewMode: AppSettings["diffViewMode"]) {
  if (collapsed) {
    return <div className="p-7 text-muted-foreground">文件已折叠</div>;
  }

  if (file.isBinary) {
    return <div className="p-7 text-muted-foreground">二进制文件不展示代码 diff。</div>;
  }

  return viewMode === "split" ? <SplitDiff file={file} /> : <UnifiedDiff file={file} />;
}

function UnifiedDiff({ file }: { file: DiffFile }) {
  return (
    <div>
      {file.hunks.map((hunk) => (
        <div className="font-mono text-sm leading-7" key={hunk.id}>
          <FoldRow count={hunk.leadingContext} />
          {hunk.lines.map((line) => (
            <div className={getUnifiedLineClassName(line.type)} key={line.id}>
              <span className="select-none border-r pr-3 text-right text-muted-foreground">
                {line.oldLineNumber ?? ""}
              </span>
              <span className="select-none border-r pr-3 text-right text-muted-foreground">
                {line.newLineNumber ?? ""}
              </span>
              <code className="min-w-0 overflow-hidden pl-4 font-mono whitespace-pre">{line.content}</code>
            </div>
          ))}
          <FoldRow count={hunk.trailingContext} />
        </div>
      ))}
    </div>
  );
}

function SplitDiff({ file }: { file: DiffFile }) {
  return (
    <div>
      {file.hunks.map((hunk) => (
        <div className="font-mono text-sm leading-7" key={hunk.id}>
          <div className="grid grid-cols-2">
            <FoldRow count={hunk.leadingContext} />
            <FoldRow count={hunk.leadingContext} />
          </div>
          {pairSplitLines(hunk.lines).map((row) => (
            <div className="grid grid-cols-2" key={row.id}>
              <SplitCell line={row.oldLine} side="old" />
              <SplitCell line={row.newLine} side="new" />
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

function SplitCell({ line, side }: { line: DiffLine | null; side: "old" | "new" }) {
  return (
    <div className={getSplitCellClassName(line?.type, side)}>
      <span className="select-none border-r pr-3 text-right text-muted-foreground">
        {side === "old" ? line?.oldLineNumber ?? "" : line?.newLineNumber ?? ""}
      </span>
      <code className="min-w-0 overflow-hidden pl-4 font-mono whitespace-pre">{line?.content ?? ""}</code>
    </div>
  );
}

function FoldRow({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }

  return (
    <div className="flex h-10 items-center gap-3 bg-muted px-4 font-sans text-sm text-muted-foreground">
      <ChevronDown className="size-4" />
      <span>{count} unmodified lines</span>
    </div>
  );
}

function getUnifiedLineClassName(type: DiffLine["type"]) {
  const base = "grid min-h-7 grid-cols-[46px_46px_minmax(0,1fr)]";
  if (type === "add") {
    return `${base} bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200`;
  }
  if (type === "delete") {
    return `${base} bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200`;
  }
  return base;
}

function getSplitCellClassName(type: DiffLine["type"] | undefined, side: "old" | "new") {
  const base = `grid min-h-7 min-w-0 grid-cols-[52px_minmax(0,1fr)] ${side === "old" ? "border-r" : ""}`;
  if (type === "add") {
    return `${base} bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200`;
  }
  if (type === "delete") {
    return `${base} bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200`;
  }
  return base;
}

function pairSplitLines(lines: DiffLine[]) {
  const rows: { id: string; oldLine: DiffLine | null; newLine: DiffLine | null }[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1];

    if (line.type === "delete" && nextLine?.type === "add") {
      rows.push({ id: `${line.id}-${nextLine.id}`, oldLine: line, newLine: nextLine });
      index += 1;
    } else if (line.type === "delete") {
      rows.push({ id: line.id, oldLine: line, newLine: null });
    } else if (line.type === "add") {
      rows.push({ id: line.id, oldLine: null, newLine: line });
    } else {
      rows.push({ id: line.id, oldLine: line, newLine: line });
    }
  }

  return rows;
}
