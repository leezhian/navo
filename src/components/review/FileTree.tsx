import { useTranslation } from "react-i18next";
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
  /** 已按目录结构整理后的文件树节点。 */
  nodes: FileTreeNode[];
  /** 当前项目根路径，用于文件右键菜单拼接完整路径。 */
  projectPath: string;
  /** 当前选中的 diff 文件 id，用于文件树高亮。 */
  selectedFileId: string | null;
  /** 按下左侧拖拽热区时触发文件树宽度调整。 */
  onResizeStart: (event: ReactPointerEvent) => void;
  /** 点击文件节点时通知上层切换或定位 diff 文件。 */
  onSelectFile: (file: DiffFile) => void;
}

export function FileTree({ nodes, projectPath, selectedFileId, onResizeStart, onSelectFile }: FileTreeProps) {
  const { t: translate } = useTranslation(["common", "review"]);
  const [searchText, setSearchText] = useState("");
  const { collapsedDirectoryIds, toggleDirectory } = useDirectoryCollapse();
  const visibleNodes = useMemo(() => filterTreeNodes(nodes, searchText), [nodes, searchText]);
  const isSearching = searchText.trim().length > 0;

  return (
    <aside className="relative grid h-full min-h-0 min-w-0 grid-rows-[48px_1fr] overflow-hidden bg-background">
      <button
        aria-label={translate("review:files.resizeTree")}
        className="absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize bg-transparent"
        type="button"
        onPointerDown={onResizeStart}
      />
      <div className="p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-7 rounded-lg pl-9 focus-visible:border-input focus-visible:ring-0"
            placeholder={translate("review:files.filterPlaceholder")}
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
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{translate("review:files.emptyMatches")}</p>
        )}
      </div>
    </aside>
  );
}

interface FileTreeItemProps {
  /** 当前已折叠目录 id 集合；搜索中会临时忽略折叠状态。 */
  collapsedDirectoryIds: Set<string>;
  /** 是否处于搜索状态，搜索时目录需要展开以露出命中文件。 */
  isSearching: boolean;
  /** 当前渲染的目录或文件节点。 */
  node: FileTreeNode;
  /** 点击文件节点时选择对应 diff 文件。 */
  onSelectFile: (file: DiffFile) => void;
  /** 点击目录整行时切换该目录展开状态。 */
  onToggleDirectory: (directoryId: string) => void;
  /** 当前项目根路径，透传给文件右键菜单。 */
  projectPath: string;
  /** 当前选中的文件 id，用于文件节点激活态。 */
  selectedFileId: string | null;
  /** 当前节点所在层级，用于计算缩进。 */
  depth?: number;
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
}: FileTreeItemProps) {
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
