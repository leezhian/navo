import type { ReactNode } from "react";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { motion } from "motion/react";
import classNames from "classnames";

const SESSION_SIDEBAR_WIDTH = 280;
const WINDOW_CONTROLS_WIDTH = 96;
const SIDEBAR_HEADER_SPACER_WIDTH = SESSION_SIDEBAR_WIDTH - WINDOW_CONTROLS_WIDTH;

interface MacWindowProps {
  /** 窗口主体内容，通常包含会话侧边栏和右侧工作区。 */
  children: ReactNode;
  /** 右侧主区域顶部的审查 tab；设置页或无会话时不传入。 */
  reviewTab?: ReactNode;
  /** 控制顶部 header 中会话栏占位宽度，避免窗口按钮在切换时重新挂载。 */
  isSidebarVisible: boolean;
  /** 点击切换边栏按钮时触发，由上层统一维护会话栏显隐状态。 */
  onToggleSidebar: () => void;
}

export function MacWindow({
  children,
  reviewTab,
  isSidebarVisible,
  onToggleSidebar,
}: MacWindowProps) {
  return (
    <div className="relative h-[calc(100vh-32px)] min-h-[680px] overflow-hidden rounded-2xl border bg-background shadow-2xl">
      <WindowHeader
        isSidebarVisible={isSidebarVisible}
        reviewTab={reviewTab}
        onToggleSidebar={onToggleSidebar}
      />
      {children}
    </div>
  );
}

interface WindowHeaderProps {
  /** 会话栏是否展开，用来驱动顶部统一网格的列宽动画。 */
  isSidebarVisible: boolean;
  /** 显示在右侧主区域顶部的当前审查页标签。 */
  reviewTab?: ReactNode;
  /** 透传给窗口控制区的边栏切换行为。 */
  onToggleSidebar: () => void;
}

function WindowHeader({ isSidebarVisible, reviewTab, onToggleSidebar }: WindowHeaderProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-12">
      <div className="flex w-24 shrink-0 items-center pl-3.5">
        <WindowControls isSidebarVisible={isSidebarVisible} onToggleSidebar={onToggleSidebar} />
      </div>
      <motion.div
        animate={{ width: isSidebarVisible ? SIDEBAR_HEADER_SPACER_WIDTH : 0 }}
        className="shrink-0 overflow-hidden"
        initial={false}
        transition={{ duration: 0.18, ease: "easeOut" }}
      />
      <div className="flex min-w-0 flex-1 items-center px-5">{reviewTab}</div>
    </div>
  );
}

interface WindowControlsProps {
  /** 允许调用方补充定位或间距类名。 */
  className?: string;
  /** 决定边栏切换按钮展示收起还是展开图标。 */
  isSidebarVisible: boolean;
  /** 点击边栏切换按钮时触发。 */
  onToggleSidebar: () => void;
}

export function WindowControls({ className, isSidebarVisible, onToggleSidebar }: WindowControlsProps) {
  const SidebarIcon = isSidebarVisible ? PanelLeftClose : PanelLeftOpen;

  return (
    <div className={classNames("pointer-events-auto flex items-center gap-3", className)}>
      <div className="flex gap-2" aria-hidden="true">
        <span className="size-[11px] rounded-full bg-[#ff5f57]" />
        <span className="size-[11px] rounded-full bg-[#febc2e]" />
        <span className="size-[11px] rounded-full bg-[#28c840]" />
      </div>
      <IconTooltip label="切换边栏" onClick={onToggleSidebar}>
        <SidebarIcon className="size-5" />
      </IconTooltip>
    </div>
  );
}

interface WindowReviewTabProps {
  /** 点击 tab 内关闭按钮时隐藏当前审查页。 */
  onClose: () => void;
}

export function WindowReviewTab({ onClose }: WindowReviewTabProps) {
  return (
    <div className="pointer-events-auto inline-flex h-[28px] items-center gap-2 rounded-md bg-muted px-2.5 text-sm text-foreground">
      <button
        aria-label="隐藏审查"
        className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
        type="button"
        onClick={onClose}
      >
        <X className="size-3.5" />
      </button>
      <span>审查</span>
    </div>
  );
}
