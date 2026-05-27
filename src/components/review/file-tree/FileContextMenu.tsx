import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { DiffFile } from "@/domain/types";
import { Code2, Copy } from "lucide-react";
import type { ReactNode } from "react";
import { copyFilePath, getFullPath, openFileInVsCode } from "./filePathActions";

interface FileContextMenuProps {
  children: ReactNode;
  file: DiffFile;
  projectPath: string;
}

export function FileContextMenu({ children, file, projectPath }: FileContextMenuProps) {
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
