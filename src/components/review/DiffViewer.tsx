import type { AppSettings, CompareMode, DiffFile, ResolvedTheme, ReviewFileAction } from "../../domain/types";
import type { CodeViewHandle } from "@pierre/diffs/react";
import type { RefObject } from "react";
import { DiffCodeView } from "./diff-code-view/DiffCodeView";
import type { LocalCommentMetadata } from "./diff-viewer/LineComment";

interface DiffViewerProps {
  /** CodeView ref，连续模式下文件树会用它定位到目标文件。 */
  codeViewRef: RefObject<CodeViewHandle<LocalCommentMetadata> | null>;
  /** 已折叠的文件 id 集合，用于控制每个 CodeView item 的 collapsed 状态。 */
  collapsedFileIds: Set<string>;
  /** 当前对比方式，传给文件头决定是否展示暂存/取消暂存按钮。 */
  compareMode: CompareMode;
  /** 当前阅读模式下需要渲染的 diff 文件列表。 */
  files: DiffFile[];
  /** 当前项目根路径，用于文件块右键菜单。 */
  projectPath: string;
  /** 应用主题解析后的实际浅深色模式，用于驱动 Pierre themeType。 */
  resolvedTheme: ResolvedTheme;
  /** 用于跨刷新恢复滚动位置的缓存键。 */
  scrollCacheKey: string | null;
  /** 本地展示设置，包含 diff 布局、字号、主题和标记方式。 */
  settings: AppSettings;
  /** 执行文件头上的还原/暂存/取消暂存操作。 */
  onFileAction: (filePaths: string[], action: ReviewFileAction) => void;
  /** 在文件块右键菜单中切换自动换行。 */
  onToggleWrap: () => void;
  /** 点击文件头时切换该文件折叠状态。 */
  onToggleFile: (fileId: string) => void;
}

export function DiffViewer({
  codeViewRef,
  collapsedFileIds,
  compareMode,
  files,
  projectPath,
  resolvedTheme,
  scrollCacheKey,
  settings,
  onFileAction,
  onToggleWrap,
  onToggleFile,
}: DiffViewerProps) {
  return (
    <DiffCodeView
      codeViewRef={codeViewRef}
      collapsedFileIds={collapsedFileIds}
      compareMode={compareMode}
      files={files}
      projectPath={projectPath}
      resolvedTheme={resolvedTheme}
      scrollCacheKey={scrollCacheKey}
      settings={settings}
      onFileAction={onFileAction}
      onToggleFile={onToggleFile}
      onToggleWrap={onToggleWrap}
    />
  );
}
