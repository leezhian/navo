import { Code2 } from "lucide-react";
import type { EditorId } from "@/shared/workspaceOpenTypes";
import { editorIcons } from "./editorIcons";

interface EditorIconProps {
  /** 按已检测编辑器的稳定 ID 映射品牌图形，未覆盖的编辑器使用通用图标。 */
  editorId: EditorId;
}

export function EditorIcon({ editorId }: EditorIconProps) {
  const icon = editorIcons[editorId];
  if (!icon) return <Code2 aria-hidden="true" className="size-3.5 shrink-0" />;
  return <svg aria-hidden="true" focusable="false" data-editor={editorId} className="size-3.5 shrink-0" viewBox={icon.viewBox} fill="currentColor"><path d={icon.path} /></svg>;
}
