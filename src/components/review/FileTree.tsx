import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { invoke } from "@tauri-apps/api/core";
import type { FileTreeNode } from "../../domain/fileTree";
import type { DiffFile } from "../../domain/types";
import { getFileIconType, type FileIconType } from "../../utils/fileIcon";
import {
  ChevronDown,
  Code2,
  Copy,
  File,
  FileCode2,
  FileImage,
  FileJson,
  FileText,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";

interface FileTreeProps {
  nodes: FileTreeNode[];
  projectPath: string;
  selectedFileId: string | null;
  onSelectFile: (file: DiffFile) => void;
}

export function FileTree({ nodes, projectPath, selectedFileId, onSelectFile }: FileTreeProps) {
  const [collapsedDirectoryIds, setCollapsedDirectoryIds] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState("");
  const visibleNodes = useMemo(() => filterTreeNodes(nodes, searchText), [nodes, searchText]);
  const isSearching = searchText.trim().length > 0;

  function toggleDirectory(directoryId: string) {
    setCollapsedDirectoryIds((current) => {
      const next = new Set(current);
      if (next.has(directoryId)) {
        next.delete(directoryId);
      } else {
        next.add(directoryId);
      }
      return next;
    });
  }

  return (
    <aside className="grid min-w-0 grid-rows-[64px_1fr] bg-muted/30">
      <div className="border-b p-3.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 rounded-xl pl-9"
            placeholder="筛选文件..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto px-3.5 py-2">
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
          className="h-[33px] w-full justify-start gap-2 rounded-lg px-2 text-left font-normal"
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
        className="flex min-h-[33px] w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-muted"
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

function FileContextMenu({
  children,
  file,
  projectPath,
}: {
  children: React.ReactNode;
  file: DiffFile;
  projectPath: string;
}) {
  const fullPath = getFullPath(projectPath, file.displayPath);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onSelect={() => openFileInVsCode(projectPath, file.displayPath)}>
          <Code2 className="size-4 text-muted-foreground" />
          <span>在 VS Code 中打开</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => copyFilePath(fullPath)}>
          <Copy className="size-4 text-muted-foreground" />
          <span>复制路径</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function FileTypeIcon({ path }: { path: string }) {
  const iconType = getFileIconType(path);
  const className = getFileIconClassName(iconType);
  const Icon = getFileIconComponent(iconType);

  return <Icon className={className} />;
}

function getFileIconComponent(iconType: FileIconType) {
  if (iconType === "image") {
    return FileImage;
  }

  if (iconType === "json") {
    return FileJson;
  }

  if (iconType === "markdown") {
    return FileText;
  }

  if (["css", "html", "javascript", "react", "rust", "style", "typescript", "vue"].includes(iconType)) {
    return FileCode2;
  }

  return File;
}

function getFileIconClassName(iconType: FileIconType) {
  const base = "size-[18px] shrink-0";
  const classes: Record<FileIconType, string> = {
    css: "text-sky-500",
    generic: "text-muted-foreground",
    html: "text-orange-500",
    image: "text-emerald-500",
    javascript: "text-yellow-500",
    json: "text-amber-500",
    markdown: "text-slate-500 dark:text-slate-300",
    react: "text-cyan-500",
    rust: "text-orange-700 dark:text-orange-400",
    style: "text-pink-500",
    typescript: "text-blue-600 dark:text-blue-400",
    vue: "text-green-500",
  };

  return `${base} ${classes[iconType]}`;
}

function filterTreeNodes(nodes: FileTreeNode[], searchText: string): FileTreeNode[] {
  const keyword = searchText.trim().toLowerCase();
  if (!keyword) {
    return nodes;
  }

  return nodes.flatMap((node) => filterTreeNode(node, keyword));
}

function filterTreeNode(node: FileTreeNode, keyword: string): FileTreeNode[] {
  if (node.type === "file") {
    return matchesFileNode(node, keyword) ? [node] : [];
  }

  const children = node.children.flatMap((child) => filterTreeNode(child, keyword));
  return children.length > 0 ? [{ ...node, children, fileCount: countFiles(children) }] : [];
}

function matchesFileNode(node: FileTreeNode, keyword: string) {
  return node.name.toLowerCase().includes(keyword) || node.path.toLowerCase().includes(keyword);
}

function countFiles(nodes: FileTreeNode[]): number {
  return nodes.reduce((count, node) => count + (node.type === "file" ? 1 : countFiles(node.children)), 0);
}

function getFullPath(projectPath: string, filePath: string) {
  return `${projectPath.replace(/\/$/, "")}/${filePath}`;
}

function copyFilePath(filePath: string) {
  void navigator.clipboard?.writeText(filePath);
}

function openFileInVsCode(projectPath: string, filePath: string) {
  void invoke("open_file_in_vscode", { projectPath, filePath });
}
