import type { DiffFile } from "./types";

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: "directory" | "file";
  children: FileTreeNode[];
  file?: DiffFile;
  fileCount: number;
}

export function buildFileTree(files: DiffFile[]): FileTreeNode[] {
  const roots: FileTreeNode[] = [];

  for (const file of files) {
    const parts = file.displayPath.split("/");
    let level = roots;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      let node = level.find((item) => item.name === part && item.type === (isFile ? "file" : "directory"));

      if (!node) {
        node = {
          id: currentPath,
          name: part,
          path: currentPath,
          type: isFile ? "file" : "directory",
          children: [],
          file: isFile ? file : undefined,
          fileCount: isFile ? 1 : 0,
        };
        level.push(node);
      }

      if (isFile) {
        node.file = file;
        node.fileCount = 1;
      } else {
        node.fileCount += 1;
      }

      level = node.children;
    });
  }

  sortTree(roots);
  return roots;
}

function sortTree(nodes: FileTreeNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  for (const node of nodes) {
    sortTree(node.children);
  }
}
