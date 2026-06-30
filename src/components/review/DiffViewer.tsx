import { useMemo, useState } from "react";
import type { AppSettings, CompareMode, DiffFile, ResolvedTheme, ReviewFileAction } from "../../domain/types";
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
  /** 应用主题解析后的实际浅深色模式，用于驱动 Pierre themeType。 */
  resolvedTheme: ResolvedTheme;
  /** 本地展示设置，包含 diff 布局、字号、主题和标记方式。 */
  settings: AppSettings;
  /** 执行文件头上的还原/暂存/取消暂存操作。 */
  onFileAction: (filePath: string, action: ReviewFileAction) => void;
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
  resolvedTheme,
  settings,
  onFileAction,
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
          resolvedTheme={resolvedTheme}
          settings={settings}
          onCommentClose={closeLineComment}
          onCommentOpen={openLineComment}
          onFileAction={onFileAction}
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
  /** 应用主题解析后的实际浅深色模式，用于驱动 Pierre themeType。 */
  resolvedTheme: ResolvedTheme;
  /** 本地展示设置，传给 Pierre diff 文件组件。 */
  settings: AppSettings;
  /** 关闭指定本地评论框。 */
  onCommentClose: (commentId: string) => void;
  /** 打开指定本地评论框。 */
  onCommentOpen: (commentId: string) => void;
  /** 执行文件级 Git 操作。 */
  onFileAction: (filePath: string, action: ReviewFileAction) => void;
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
  resolvedTheme,
  settings,
  onCommentClose,
  onCommentOpen,
  onFileAction,
  onToggle,
  onToggleWrap,
}: DiffFileViewProps) {
  const lineAnnotations = useMemo(() => getLineAnnotations(file.id, activeCommentIds), [activeCommentIds, file.id]);

  return (
    <FileContextMenu
      file={file}
      projectPath={projectPath}
      showWrapToggle
      wrapDiffLines={settings.wrapDiffLines}
      onToggleWrap={onToggleWrap}
    >
      <article className="group/file" id={`diff-file-${file.id}`}>
        <PierreDiffFile
          collapsed={collapsed}
          compareMode={compareMode}
          file={file}
          lineAnnotations={lineAnnotations}
          resolvedTheme={resolvedTheme}
          settings={settings}
          onCommentClose={onCommentClose}
          onCommentOpen={onCommentOpen}
          onFileAction={onFileAction}
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
