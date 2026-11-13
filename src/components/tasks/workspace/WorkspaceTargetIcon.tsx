import { FolderOpen, Terminal } from "lucide-react";
import type { WorkspaceOpenOptions, WorkspaceOpenTarget } from "@/shared/workspaceOpenTypes";
import { RepositoryProviderIcon } from "@/components/icons/RepositoryProviderIcon";
import { EditorIcon } from "@/components/icons/EditorIcon";

interface WorkspaceTargetIconProps {
  /** 已解析可用性的打开目标；快捷按钮与菜单复用相同图标。 */
  target: WorkspaceOpenTarget;
  options: WorkspaceOpenOptions | null;
}
export function WorkspaceTargetIcon({ target, options }: WorkspaceTargetIconProps) {
  if (target.kind === "editor") return <EditorIcon editorId={target.editorId} />;
  if (target.kind === "remote") return <RepositoryProviderIcon provider={options?.remote?.provider ?? ""} />;
  return target.kind === "terminal" ? <Terminal className="size-3.5" /> : <FolderOpen className="size-3.5" />;
}
