import { useMemo, useState } from "react";
import type { AppSettings, CompareMode, DiffFile } from "../../domain/types";
import { parseLineCommentId } from "./diff-viewer/LineComment";
import { PierreDiffFile, type LocalCommentAnnotation } from "./diff-viewer/PierreDiffFile";
import { FileContextMenu } from "./file-actions/FileContextMenu";

interface DiffViewerProps {
  /** 已折叠的文件 id 集合，用于控制每个 Pierre 文件 diff 的 collapsed 状态。 */
  collapsedFileIds: Set<string>;
  /** 当前对比方式，传给文件头决定是否展示暂存/取消暂存按钮。 */
  compareMode: CompareMode;
  /** 当前阅读模式下需要渲染的 diff 文件列表。 */
  files: DiffFile[];
  /** 当前项目根路径，用于文件块右键菜单。 */
  projectPath: string;
  /** 是否开启自动换行，传给 Pierre overflow 配置和右键菜单。 */
  wrapDiffLines: boolean;
  /** 统一或分栏 diff 视图模式。 */
  viewMode: AppSettings["diffViewMode"];
  /** 在文件块右键菜单中切换自动换行。 */
  onToggleWrap: () => void;
  /** 点击文件头时切换该文件折叠状态。 */
  onToggleFile: (fileId: string) => void;
}

export function DiffViewer({
  collapsedFileIds,
  compareMode,
  files,
  projectPath,
  wrapDiffLines,
  viewMode,
  onToggleWrap,
  onToggleFile,
}: DiffViewerProps) {
  const [activeCommentIds, setActiveCommentIds] = useState<Set<string>>(new Set());

  function openLineComment(commentId: string) {
    setActiveCommentIds((current) => new Set(current).add(commentId));
  }

  function closeLineComment(commentId: string) {
    setActiveCommentIds((current) => {
      const next = new Set(current);
      next.delete(commentId);
      return next;
    });
  }

  return (
    <>
      {files.map((file) => (
        <DiffFileView
          activeCommentIds={activeCommentIds}
          collapsed={collapsedFileIds.has(file.id)}
          compareMode={compareMode}
          file={file}
          key={file.id}
          projectPath={projectPath}
          viewMode={viewMode}
          wrapDiffLines={wrapDiffLines}
          onCommentClose={closeLineComment}
          onCommentOpen={openLineComment}
          onToggle={() => onToggleFile(file.id)}
          onToggleWrap={onToggleWrap}
        />
      ))}
    </>
  );
}

interface DiffFileViewProps {
  /** 当前已打开的本地评论 id 集合，允许同屏显示多个评论框。 */
  activeCommentIds: Set<string>;
  /** 当前文件是否折叠。 */
  collapsed: boolean;
  /** 当前对比方式，用于文件头操作按钮判断。 */
  compareMode: CompareMode;
  /** 当前文件的应用层 diff 数据和 Pierre 元数据。 */
  file: DiffFile;
  /** 当前项目根路径，用于文件块右键菜单。 */
  projectPath: string;
  /** 当前 diff 展示模式。 */
  viewMode: AppSettings["diffViewMode"];
  /** 当前文件块是否自动换行。 */
  wrapDiffLines: boolean;
  /** 关闭指定本地评论框。 */
  onCommentClose: (commentId: string) => void;
  /** 打开指定本地评论框。 */
  onCommentOpen: (commentId: string) => void;
  /** 切换当前文件折叠状态。 */
  onToggle: () => void;
  /** 切换全局 diff 自动换行设置。 */
  onToggleWrap: () => void;
}

function DiffFileView({
  activeCommentIds,
  collapsed,
  compareMode,
  file,
  projectPath,
  viewMode,
  wrapDiffLines,
  onCommentClose,
  onCommentOpen,
  onToggle,
  onToggleWrap,
}: DiffFileViewProps) {
  const lineAnnotations = useMemo(() => getLineAnnotations(file.id, activeCommentIds), [activeCommentIds, file.id]);

  return (
    <FileContextMenu
      file={file}
      projectPath={projectPath}
      showWrapToggle
      wrapDiffLines={wrapDiffLines}
      onToggleWrap={onToggleWrap}
    >
      <article className="group/file" id={`diff-file-${file.id}`}>
        <PierreDiffFile
          collapsed={collapsed}
          compareMode={compareMode}
          file={file}
          lineAnnotations={lineAnnotations}
          viewMode={viewMode}
          wrapDiffLines={wrapDiffLines}
          onCommentClose={onCommentClose}
          onCommentOpen={onCommentOpen}
          onToggle={onToggle}
        />
      </article>
    </FileContextMenu>
  );
}

function getLineAnnotations(fileId: string, activeCommentIds: Set<string>): LocalCommentAnnotation[] {
  const annotations: LocalCommentAnnotation[] = [];

  // Pierre 的 annotation 需要按文件提供，避免某个文件的评论框插入到其它文件 diff 中。
  for (const commentId of activeCommentIds) {
    if (!commentId.startsWith(`${fileId}:`)) {
      continue;
    }

    const metadata = parseLineCommentId(commentId);

    if (!metadata) {
      continue;
    }

    annotations.push({
      lineNumber: metadata.lineNumber,
      metadata,
      side: metadata.side,
    });
  }

  return annotations;
}
