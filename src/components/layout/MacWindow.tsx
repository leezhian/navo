import type { ReactNode } from "react";
import { useWindowFullScreen } from "@/hooks/useWindowFullScreen";
import { isApplePlatform } from "@/utils/platform";
import { FULL_SCREEN_HISTORY_OFFSET, WINDOW_HISTORY_OFFSET } from "@/shared/windowLayout";

interface MacWindowProps {
  /** 应用导航栏及模块内容，保持在窗口拖动区之外。 */
  children: ReactNode;
  /** 顶部历史导航与工作区标签，交互区域自行标记为不可拖动。 */
  headerActions: ReactNode;
}

export function MacWindow({ children, headerActions }: MacWindowProps) {
  const isFullScreen = useWindowFullScreen();
  const offset = isApplePlatform() && !isFullScreen ? WINDOW_HISTORY_OFFSET : FULL_SCREEN_HISTORY_OFFSET;
  return (
    <div className="navo-window">
      <header className="window-drag-region navo-window-header" style={{ paddingLeft: offset }}>
        <div className="flex min-w-0 flex-1 items-center gap-4 pr-4">{headerActions}</div>
      </header>
      {children}
    </div>
  );
}
