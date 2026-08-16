import { useEffect, type ReactNode } from "react";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useWindowFullScreen } from "@/hooks/useWindowFullScreen";
import { PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import { motion } from "motion/react";
import classNames from "classnames";
import { isApplePlatform } from "@/utils/platform";
import {
  FULL_SCREEN_SIDEBAR_TOGGLE_OFFSET,
  FULL_SCREEN_WINDOW_CONTROLS_WIDTH,
  SESSION_SIDEBAR_WIDTH,
  SESSION_SIDEBAR_TRANSITION,
  SIDEBAR_TOGGLE_OFFSET,
  WINDOW_CONTROLS_WIDTH,
} from "@/shared/windowLayout";

interface MacWindowProps {
  /** 窗口主体内容，通常包含会话侧边栏和右侧工作区。 */
  children: ReactNode;
  /** 右侧主区域顶部的工作区标签，例如审查和终端页。 */
  workspaceTabs?: ReactNode;
  /** 控制顶部 header 中会话栏占位宽度，避免窗口按钮在切换时重新挂载。 */
  isSidebarVisible: boolean;
  /** 点击切换边栏按钮时触发，由上层统一维护会话栏显隐状态。 */
  onToggleSidebar: () => void;
}

export function MacWindow({
  children,
  workspaceTabs,
  isSidebarVisible,
  onToggleSidebar,
}: MacWindowProps) {
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (!isSidebarShortcut(event)) {
        return;
      }

      event.preventDefault();
      onToggleSidebar();
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onToggleSidebar]);

  return (
    <div className="relative h-screen min-h-[600px] overflow-hidden bg-transparent">
      <WindowHeader
        isSidebarVisible={isSidebarVisible}
        workspaceTabs={workspaceTabs}
        onToggleSidebar={onToggleSidebar}
      />
      {children}
    </div>
  );
}

interface WindowHeaderProps {
  /** 会话栏是否展开，用来驱动顶部统一网格的列宽动画。 */
  isSidebarVisible: boolean;
  /** 显示在右侧主区域顶部的工作区标签。 */
  workspaceTabs?: ReactNode;
  /** 透传给窗口控制区的边栏切换行为。 */
  onToggleSidebar: () => void;
}

function WindowHeader({ isSidebarVisible, workspaceTabs, onToggleSidebar }: WindowHeaderProps) {
  const isFullScreen = useWindowFullScreen();
  const controlsWidth = isFullScreen ? FULL_SCREEN_WINDOW_CONTROLS_WIDTH : WINDOW_CONTROLS_WIDTH;
  const sidebarToggleOffset = isFullScreen ? FULL_SCREEN_SIDEBAR_TOGGLE_OFFSET : SIDEBAR_TOGGLE_OFFSET;
  const sidebarSpacerWidth = Math.max(SESSION_SIDEBAR_WIDTH - controlsWidth, 0);

  return (
    <div className="window-drag-region pointer-events-auto absolute inset-x-0 top-0 z-30 flex h-12 select-none">
      <motion.div
        animate={{ paddingLeft: sidebarToggleOffset, width: controlsWidth }}
        className="flex shrink-0 items-center"
        initial={false}
        transition={SESSION_SIDEBAR_TRANSITION}
      >
        <WindowControls isSidebarVisible={isSidebarVisible} onToggleSidebar={onToggleSidebar} />
      </motion.div>
      <motion.div
        animate={{ width: isSidebarVisible ? sidebarSpacerWidth : 0 }}
        className="shrink-0 overflow-hidden"
        initial={false}
        transition={SESSION_SIDEBAR_TRANSITION}
      />
      <div className="flex min-w-0 flex-1 items-center px-5">{workspaceTabs}</div>
    </div>
  );
}

interface WindowControlsProps {
  /** 决定边栏切换按钮展示收起还是展开图标。 */
  isSidebarVisible: boolean;
  /** 点击边栏切换按钮时触发。 */
  onToggleSidebar: () => void;
}

function WindowControls({ isSidebarVisible, onToggleSidebar }: WindowControlsProps) {
  const SidebarIcon = isSidebarVisible ? PanelLeftClose : PanelLeftOpen;
  const shortcutLabel = getSidebarShortcutLabel();

  return (
    <div className="window-no-drag pointer-events-auto flex items-center">
      <IconTooltip label={`切换边栏 ${shortcutLabel}`} onClick={onToggleSidebar}>
        <SidebarIcon className="size-4" />
      </IconTooltip>
    </div>
  );
}

interface WindowWorkspaceTabsProps {
  /** 是否存在可切回的审查页；关闭审查页后只保留终端 tab。 */
  hasReview: boolean;
  /** 审查页是否为当前展示的工作区。 */
  isReviewActive: boolean;
  /** 已创建的终端页列表，当前版本只负责 tab 和占位页管理。 */
  terminalTabs: WindowTerminalTab[];
  /** 当前激活的终端页 id。 */
  activeTerminalId: string | null;
  /** 点击审查 tab 时切回审查页。 */
  onSelectReview: () => void;
  /** 点击审查 tab 关闭按钮时隐藏审查页。 */
  onCloseReview: () => void;
  /** 点击加号按钮时创建新的终端页。 */
  onAddTerminal: () => void;
  /** 点击终端 tab 时切换到对应终端页。 */
  onSelectTerminal: (tabId: string) => void;
  /** 点击终端 tab 关闭按钮时关闭对应终端页。 */
  onCloseTerminal: (tabId: string) => void;
}

export interface WindowTerminalTab {
  /** 终端页唯一 id，用于激活和关闭。 */
  id: string;
  /** 展示在顶部 tab 中的终端页名称。 */
  title: string;
}

export function WindowWorkspaceTabs({
  hasReview,
  isReviewActive,
  terminalTabs,
  activeTerminalId,
  onSelectReview,
  onCloseReview,
  onAddTerminal,
  onSelectTerminal,
  onCloseTerminal,
}: WindowWorkspaceTabsProps) {
  return (
    <div className="window-no-drag pointer-events-auto flex min-w-0 items-center gap-1.5">
      {hasReview && (
        <WindowTab active={isReviewActive} title="审查" onClose={onCloseReview} onSelect={onSelectReview} />
      )}
      {terminalTabs.map((tab) => (
        <WindowTab
          active={tab.id === activeTerminalId}
          key={tab.id}
          title={tab.title}
          onClose={() => onCloseTerminal(tab.id)}
          onSelect={() => onSelectTerminal(tab.id)}
        />
      ))}
      <IconTooltip className="size-7" label="新增终端页" onClick={onAddTerminal}>
        <Plus className="size-4" />
      </IconTooltip>
    </div>
  );
}

interface WindowTabProps {
  /** 当前 tab 是否处于激活状态。 */
  active: boolean;
  /** tab 展示名称。 */
  title: string;
  /** 点击关闭按钮时触发。 */
  onClose: () => void;
  /** 点击 tab 主体时切换到该工作区。 */
  onSelect: () => void;
}

function WindowTab({ active, title, onClose, onSelect }: WindowTabProps) {
  return (
    <div
      className={classNames(
        "inline-flex h-[28px] max-w-40 items-center gap-2 rounded-md px-2.5 text-sm text-foreground",
        active ? "bg-muted" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
    >
      <button
        className="min-w-0 truncate"
        type="button"
        onClick={onSelect}
      >
        {title}
      </button>
      <button
        aria-label={`关闭${title}`}
        className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
        type="button"
        onClick={onClose}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function isSidebarShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.repeat || isEditableTarget(event.target)) {
    return false;
  }

  const usesMacShortcut = isApplePlatform();
  const hasModifier = usesMacShortcut ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;

  return hasModifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "b";
}

function getSidebarShortcutLabel() {
  return isApplePlatform() ? "⌘B" : "Ctrl+B";
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
