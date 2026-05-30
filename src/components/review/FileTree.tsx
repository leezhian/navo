import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FileTreeNode } from "@/domain/fileTree";
import type { DiffFile } from "@/domain/types";
import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { FileContextMenu } from "./file-actions/FileContextMenu";
import { FileTypeIcon } from "./file-tree/FileTypeIcon";
import { filterTreeNodes } from "./file-tree/fileTreeFilter";
import { useDirectoryCollapse } from "./file-tree/useDirectoryCollapse";

interface FileTreeProps {
  nodes: FileTreeNode[];
  projectPath: string;
  selectedFileId: string | null;
  onResizeStart: (event: ReactPointerEvent) => void;
  onSelectFile: (file: DiffFile) => void;
}

export function FileTree({ nodes, projectPath, selectedFileId, onResizeStart, onSelectFile }: FileTreeProps) {
  const [searchText, setSearchText] = useState("");
  const { collapsedDirectoryIds, toggleDirectory } = useDirectoryCollapse();
  const visibleNodes = useMemo(() => filterTreeNodes(nodes, searchText), [nodes, searchText]);
  const isSearching = searchText.trim().length > 0;

  return (
    <aside className="relative grid h-full min-h-0 min-w-0 grid-rows-[48px_1fr] overflow-hidden bg-background">
      <button
        aria-label="调整文件树宽度"
        className="absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize bg-transparent"
        type="button"
        onPointerDown={onResizeStart}
      />
      <div className="p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-7 rounded-lg pl-9 focus-visible:border-input focus-visible:ring-0"
            placeholder="筛选文件..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto px-3.5 pt-0 pb-2">
        {visibleNodes.map((node) => (
          <FileTreeItem
            collapsedDirectoryIds={collapsedDirectoryIds}
            isSearching={isSearching}
            key={node.id}
            node={node}
            projectPath={projectPath}
            selectedFileId={selectedFileId}
            onSelectFile={onSelectFile}
            onToggleDirectory={toggleDirectory}
          />
        ))}
        {visibleNodes.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">没有匹配的文件</p>
        )}
      </div>
    </aside>
  );
}

function FileTreeItem({
  collapsedDirectoryIds,
  isSearching,
  node,
  onSelectFile,
  onToggleDirectory,
  projectPath,
  selectedFileId,
  depth = 0,
}: {
  collapsedDirectoryIds: Set<string>;
  isSearching: boolean;
  node: FileTreeNode;
  onSelectFile: (file: DiffFile) => void;
  onToggleDirectory: (directoryId: string) => void;
  projectPath: string;
  selectedFileId: string | null;
  depth?: number;
}) {
  const paddingLeft = 12 + depth * 18;

  if (node.type === "file" && node.file) {
    return (
      <FileContextMenu file={node.file} projectPath={projectPath}>
        <Button
          className="h-7 w-full justify-start gap-2 rounded-md px-2 text-left text-xs font-normal"
          style={{ paddingLeft }}
          type="button"
          variant={node.file.id === selectedFileId ? "secondary" : "ghost"}
          onClick={() => onSelectFile(node.file as DiffFile)}
        >
          <FileTypeIcon path={node.file.displayPath} />
          <span className="truncate">{node.name}</span>
        </Button>
      </FileContextMenu>
    );
  }

  const isCollapsed = !isSearching && collapsedDirectoryIds.has(node.id);

  return (
    <div>
      <button
        className="flex min-h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-muted"
        style={{ paddingLeft }}
        type="button"
        onClick={() => onToggleDirectory(node.id)}
        onContextMenu={(event) => event.preventDefault()}
      >
        <ChevronDown
          className={
            isCollapsed
              ? "-rotate-90 size-4 text-muted-foreground transition-transform"
              : "size-4 text-muted-foreground transition-transform"
          }
        />
        <span className="truncate">{node.name}</span>
      </button>
      {!isCollapsed &&
        node.children.map((child) => (
          <FileTreeItem
            collapsedDirectoryIds={collapsedDirectoryIds}
            depth={depth + 1}
            isSearching={isSearching}
            key={child.id}
            node={child}
            projectPath={projectPath}
            selectedFileId={selectedFileId}
            onSelectFile={onSelectFile}
            onToggleDirectory={onToggleDirectory}
          />
        ))}
    </div>
  );
}
