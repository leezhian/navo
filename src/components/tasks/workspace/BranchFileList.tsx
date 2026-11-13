import { useState } from "react";
import { ChevronDown, ChevronRight, FileCode2 } from "lucide-react";
import type { TaskBranchFile } from "@/shared/taskBranchTypes";

interface BranchFileListProps {
  /** 当前对比范围内经过筛选的真实文件统计。 */
  files: TaskBranchFile[];
  tree: boolean;
  /** 保留完整路径以便旧 Diff 定位，不能使用文件名匹配。 */
  onSelect: (path: string) => void;
}
export function BranchFileList({ files, tree, onSelect }: BranchFileListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const groups = [...new Set(files.map((file) => file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : ""))];
  function row(file: TaskBranchFile) {
    return <button key={file.path} className="task-branch-file" title={file.path} onClick={() => onSelect(file.path)}>
      <FileCode2 /><span className="min-w-0 flex-1 truncate">{tree ? file.path.split("/").pop() : file.path}</span>
      {!file.binary && <span className="task-branch-delta"><span className="text-green-600 dark:text-green-400">+{file.additions}</span><span className="text-red-600 dark:text-red-400">−{file.deletions}</span></span>}
      <span className="text-muted-foreground">{file.status}</span>
    </button>;
  }
  if (!tree) return <>{files.map(row)}</>;
  return <>{groups.map((directory) => {
    const groupFiles = files.filter((file) => (file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "") === directory);
    if (!directory) return <div key="root">{groupFiles.map(row)}</div>;
    const closed = collapsed.has(directory);
    return <div key={directory} className="task-branch-file-group"><button className="task-branch-directory" aria-expanded={!closed} onClick={() => setCollapsed((current) => {
      const next = new Set(current); if (next.has(directory)) next.delete(directory); else next.add(directory); return next;
    })}>{closed ? <ChevronRight /> : <ChevronDown />}<span className="truncate">{directory}</span></button>{!closed && groupFiles.map(row)}</div>;
  })}</>;
}
