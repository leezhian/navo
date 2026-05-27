import type { FileTreeNode } from "@/domain/fileTree";

export function filterTreeNodes(nodes: FileTreeNode[], searchText: string): FileTreeNode[] {
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
  // 搜索文件时保留命中文件的父目录，避免结果变成一组失去层级的孤立文件。
  return children.length > 0 ? [{ ...node, children, fileCount: countFiles(children) }] : [];
}

function matchesFileNode(node: FileTreeNode, keyword: string) {
  return node.name.toLowerCase().includes(keyword) || node.path.toLowerCase().includes(keyword);
}

function countFiles(nodes: FileTreeNode[]): number {
  return nodes.reduce((count, node) => count + (node.type === "file" ? 1 : countFiles(node.children)), 0);
}
